import { buildApp } from '@/server'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const TOKEN = 'b'.repeat(40)

describe('POST /media/v1/assets/urls:batch', () => {
  let db: TestDb
  beforeAll(async () => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.MEDIA_SERVICE_TOKEN = TOKEN
    process.env.MEDIA_PUBLIC_BASE_URL = 'http://localhost:3001'
    db = await startTestDb()
    process.env.DATABASE_URL = db.url
  }, 180_000)
  afterAll(async () => {
    await db.stop()
  })

  beforeEach(async () => {
    await db.prisma.assetBaby.deleteMany()
    await db.prisma.asset.deleteMany()
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.users (id, email, display_name, password_hash, created_at, updated_at)
      VALUES ('33333333-3333-3333-3333-333333333333', 'a@b.com', 'U', 'x', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `)
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
      VALUES ('11111111-1111-1111-1111-111111111111', 'F', 'f', '33333333-3333-3333-3333-333333333333', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `)
  })

  async function seedAsset(
    id: string,
    familyId = '11111111-1111-1111-1111-111111111111',
  ): Promise<void> {
    await db.prisma.asset.create({
      data: {
        id,
        familyId,
        uploadedByUserId: '33333333-3333-3333-3333-333333333333',
        kind: 'image',
        originalKey: `families/fam/assets/${id}/original`,
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(100),
        sha256: id.replace(/-/g, '').padEnd(64, '0'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
      },
    })
  }

  test('returns map of URLs for requested asset ids', async () => {
    const id1 = '22222222-2222-2222-2222-222222222222'
    const id2 = '44444444-4444-4444-4444-444444444444'
    await seedAsset(id1)
    await seedAsset(id2)

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/urls:batch',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {
        familyId: '11111111-1111-1111-1111-111111111111',
        assetIds: [id1, id2],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.v).toBe(1)
    expect(body.urls[id1].original).toContain('/media/v1/files/')
    expect(body.urls[id2].original).toContain('/media/v1/files/')
    await app.close()
  })

  test('missing assets are simply absent from the returned map', async () => {
    const id1 = '22222222-2222-2222-2222-222222222222'
    const missing = '99999999-9999-9999-9999-999999999999'
    await seedAsset(id1)
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/urls:batch',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {
        familyId: '11111111-1111-1111-1111-111111111111',
        assetIds: [id1, missing],
      },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.urls[id1]).toBeDefined()
    expect(body.urls[missing]).toBeUndefined()
    await app.close()
  })

  test('tiers narrows the response to the requested tiers, byte-identical otherwise', async () => {
    const id = '22222222-2222-2222-2222-222222222222'
    await seedAsset(id)
    await db.prisma.asset.update({
      where: { id },
      data: {
        derivatives: {
          v: 2,
          thumb256: { avif: 'a256', webp: 'w256', jpeg: 'j256' },
          thumb512: { avif: 'a512', webp: 'w512', jpeg: 'j512' },
          display1080: { avif: 'a1080', webp: 'w1080', jpeg: 'j1080' },
        },
      },
    })
    const app = buildApp()
    const ask = async (tiers?: string[]) => {
      const res = await app.inject({
        method: 'POST',
        url: '/media/v1/assets/urls:batch',
        headers: { authorization: `Bearer ${TOKEN}` },
        payload: {
          familyId: '11111111-1111-1111-1111-111111111111',
          assetIds: [id],
          ...(tiers ? { tiers } : {}),
        },
      })
      expect(res.statusCode).toBe(200)
      return JSON.parse(res.body).urls[id]
    }

    const thumbOnly = await ask(['thumb'])
    expect(thumbOnly.thumb256.jpeg).toContain('/media/v1/files/')
    expect(thumbOnly.thumb512.jpeg).toContain('/media/v1/files/')
    expect(thumbOnly.display1080).toBeNull()
    expect(thumbOnly.original).toBeNull()

    // 티어를 안 주면 예전과 같은 응답 — 같은 15분 창 안이라 URL 문자열까지 동일하다
    // (expiresAt 만 호출 시각이라 다르다).
    const full = await ask()
    const alsoFull = await ask(['thumb', 'display', 'original', 'video'])
    expect({ ...alsoFull, expiresAt: '' }).toEqual({ ...full, expiresAt: '' })
    expect(full.display1080.avif).toContain('/media/v1/files/')
    expect(full.thumb256).toEqual(thumbOnly.thumb256)
    await app.close()
  })

  test('rejects requests exceeding 200 asset ids', async () => {
    const ids = Array.from({ length: 201 }, () => '22222222-2222-2222-2222-222222222222')
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/urls:batch',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { familyId: '11111111-1111-1111-1111-111111111111', assetIds: ids },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  test('empty assetIds array returns empty map', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/urls:batch',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { familyId: '11111111-1111-1111-1111-111111111111', assetIds: [] },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Object.keys(body.urls)).toHaveLength(0)
    await app.close()
  })

  test('401 without service token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/urls:batch',
      payload: { familyId: '11111111-1111-1111-1111-111111111111', assetIds: [] },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
