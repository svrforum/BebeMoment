import { buildApp } from '@/server'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const SECRET = 'a'.repeat(40)
const TOKEN = 'b'.repeat(40)

const FAMILY_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const ASSET_ID = '33333333-3333-3333-3333-333333333333'

// Stub the storage adapter — purge doesn't need real bytes; it just needs
// storage.delete to resolve (or reject, in the "tolerates errors" test).
const deletedKeys: string[] = []
let shouldThrowOn: string | null = null

vi.mock('@/lib/storage', () => ({
  getStorage: () => ({
    async delete(key: string) {
      if (shouldThrowOn && key.includes(shouldThrowOn)) {
        throw new Error(`simulated delete failure: ${key}`)
      }
      deletedKeys.push(key)
    },
  }),
}))

describe('POST /media/v1/assets/:id:purge', () => {
  let db: TestDb
  beforeAll(async () => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.MEDIA_SERVICE_TOKEN = TOKEN
    db = await startTestDb()
    process.env.DATABASE_URL = db.url
  }, 180_000)
  afterAll(async () => {
    await db.stop()
  })

  beforeEach(async () => {
    deletedKeys.length = 0
    shouldThrowOn = null
    await db.prisma.assetBaby.deleteMany({ where: { asset: { familyId: FAMILY_ID } } })
    await db.prisma.asset.deleteMany({ where: { familyId: FAMILY_ID } })
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.users (id, email, password_hash, display_name, created_at, updated_at)
      VALUES ('${USER_ID}', 'p@b.com', 'x', 'U', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `)
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
      VALUES ('${FAMILY_ID}', 'F', 'f', '${USER_ID}', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `)
  })

  async function seedSoftDeletedAsset(
    opts: { withDerivatives?: boolean; kind?: 'image' | 'video' } = {},
  ) {
    const derivatives = opts.withDerivatives
      ? {
          v: 2,
          thumb256: { avif: 'd/256.avif', webp: 'd/256.webp', jpeg: 'd/256.jpg' },
          thumb512: { avif: 'd/512.avif', webp: 'd/512.webp', jpeg: 'd/512.jpg' },
          display1080: { avif: 'd/1080.avif', webp: 'd/1080.webp', jpeg: 'd/1080.jpg' },
          ...(opts.kind === 'video'
            ? { videoPoster: 'd/poster.jpg', videoCompat: 'd/preview.mp4' }
            : {}),
        }
      : {}
    await db.prisma.asset.create({
      data: {
        id: ASSET_ID,
        familyId: FAMILY_ID,
        uploadedByUserId: USER_ID,
        kind: opts.kind ?? 'image',
        originalKey: `families/${FAMILY_ID}/assets/${ASSET_ID}/original`,
        originalFilename: 'a.jpg',
        mimeType: opts.kind === 'video' ? 'video/mp4' : 'image/jpeg',
        sizeBytes: BigInt(100),
        sha256: ''.padEnd(64, '0'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
        derivatives,
        deletedAt: new Date(),
      },
    })
  }

  test('401 without service token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/media/v1/assets/${ASSET_ID}:purge?familyId=${FAMILY_ID}`,
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('404 when asset does not exist', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/media/v1/assets/${ASSET_ID}:purge?familyId=${FAMILY_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  test('400 when asset is not soft-deleted', async () => {
    await db.prisma.asset.create({
      data: {
        id: ASSET_ID,
        familyId: FAMILY_ID,
        uploadedByUserId: USER_ID,
        kind: 'image',
        originalKey: `families/${FAMILY_ID}/assets/${ASSET_ID}/original`,
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(100),
        sha256: ''.padEnd(64, '0'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
        // no deletedAt — asset is live, not in trash
      },
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/media/v1/assets/${ASSET_ID}:purge?familyId=${FAMILY_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('ASSET_NOT_DELETED')
    await app.close()
  })

  test('200 deletes original + all derivative keys + hard-deletes row', async () => {
    await seedSoftDeletedAsset({ withDerivatives: true })
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/media/v1/assets/${ASSET_ID}:purge?familyId=${FAMILY_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.v).toBe(1)
    expect(body.assetId).toBe(ASSET_ID)
    expect(body.deletedKeys).toBe(10) // original + 3 tiers × 3 formats
    expect(deletedKeys).toContain(`families/${FAMILY_ID}/assets/${ASSET_ID}/original`)
    expect(deletedKeys).toContain('d/256.avif')
    expect(deletedKeys).toContain('d/1080.jpg')
    // Row is hard-deleted.
    const row = await db.prisma.asset.findFirst({ where: { id: ASSET_ID } })
    expect(row).toBeNull()
    await app.close()
  })

  test('video derivatives include poster + preview', async () => {
    await seedSoftDeletedAsset({ withDerivatives: true, kind: 'video' })
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/media/v1/assets/${ASSET_ID}:purge?familyId=${FAMILY_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(200)
    expect(deletedKeys).toContain('d/poster.jpg')
    expect(deletedKeys).toContain('d/preview.mp4')
    await app.close()
  })

  test('tolerates per-key storage.delete failures and still hard-deletes the row', async () => {
    shouldThrowOn = '256.avif'
    await seedSoftDeletedAsset({ withDerivatives: true })
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/media/v1/assets/${ASSET_ID}:purge?familyId=${FAMILY_ID}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.failedKeys).toHaveLength(1)
    expect(body.failedKeys[0].key).toBe('d/256.avif')
    // Row is still gone — the partial failure shouldn't orphan it.
    const row = await db.prisma.asset.findFirst({ where: { id: ASSET_ID } })
    expect(row).toBeNull()
    await app.close()
  })

  test("different family cannot purge another family's asset", async () => {
    const OTHER_FAMILY = '99999999-9999-9999-9999-999999999999'
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
      VALUES ('${OTHER_FAMILY}', 'O', 'o', '${USER_ID}', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `)
    await seedSoftDeletedAsset({ withDerivatives: false })
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/media/v1/assets/${ASSET_ID}:purge?familyId=${OTHER_FAMILY}`,
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(404)
    // Asset still exists in original family
    const row = await db.prisma.asset.findFirst({ where: { id: ASSET_ID } })
    expect(row).not.toBeNull()
    await app.close()
  })
})
