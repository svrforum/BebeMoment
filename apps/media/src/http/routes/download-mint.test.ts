import { verifyDownloadToken } from '@/lib/jwt'
import type { Prisma } from '@bebe/db-media'
import { buildApp } from '@/server'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const TOKEN = 'b'.repeat(40)
const FAMILY = '11111111-1111-1111-1111-111111111111'
const ASSET = '22222222-2222-2222-2222-222222222222'
const USER = '33333333-3333-3333-3333-333333333333'

const COMPAT_KEY = `derivatives/${ASSET}/preview.mp4`

async function mint(quality: string) {
  const app = buildApp()
  const res = await app.inject({
    method: 'POST',
    url: '/media/v1/download/mint',
    headers: { authorization: `Bearer ${TOKEN}` },
    payload: { familyId: FAMILY, assetId: ASSET, quality },
  })
  await app.close()
  return res
}

function tokenFrom(body: string): string {
  const { url } = JSON.parse(body) as { url: string }
  return url.split('/').pop() as string
}

describe('POST /media/v1/download/mint — auto quality', () => {
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
    await db.prisma.asset.deleteMany()
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.users (id, email, display_name, password_hash, created_at, updated_at)
      VALUES ('${USER}', 'a@b.com', 'U', 'x', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `)
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
      VALUES ('${FAMILY}', 'F', 'f', '${USER}', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING;
    `)
  })

  async function createVideo(derivatives: Prisma.InputJsonObject, filename = 'clip.mp4') {
    await db.prisma.asset.create({
      data: {
        id: ASSET,
        familyId: FAMILY,
        uploadedByUserId: USER,
        kind: 'video',
        originalKey: `families/${FAMILY}/assets/${ASSET}/original`,
        originalFilename: filename,
        mimeType: 'video/mp4',
        sizeBytes: BigInt(1000),
        sha256: ''.padEnd(64, '0'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
        derivatives,
      },
    })
  }

  test('원본이 폰에서 안 열리면 호환본을 준다 — 저장한 영상이 소리만 나던 문제', async () => {
    await createVideo({ v: 2, videoCompat: COMPAT_KEY, originalPlayable: false })
    const res = await mint('auto')
    expect(res.statusCode).toBe(200)
    const payload = await verifyDownloadToken(tokenFrom(res.body))
    expect(payload.quality).toBe('compat')
    expect(payload.videoCompatKey).toBe(COMPAT_KEY)
    expect(payload.mimeType).toBe('video/mp4')
  })

  test('원본이 폰에서 열리면 원본 바이트를 그대로 준다 — 화질을 깎지 않는다', async () => {
    await createVideo({ v: 2, videoCompat: COMPAT_KEY, originalPlayable: true })
    const payload = await verifyDownloadToken(tokenFrom((await mint('auto')).body))
    expect(payload.quality).toBe('original')
    expect(payload.videoCompatKey).toBeUndefined()
    expect(payload.filename).toBe('clip.mp4')
  })

  test('판정 전 자산은 원본을 준다 — 멀쩡한 영상을 조용히 축소하지 않는다', async () => {
    await createVideo({ v: 2, videoCompat: COMPAT_KEY })
    const payload = await verifyDownloadToken(tokenFrom((await mint('auto')).body))
    expect(payload.quality).toBe('original')
  })

  test('호환본이 아직 없으면 원본으로 둔다', async () => {
    await createVideo({ v: 2, originalPlayable: false })
    const payload = await verifyDownloadToken(tokenFrom((await mint('auto')).body))
    expect(payload.quality).toBe('original')
  })

  test('확장자가 다른 원본이면 호환본 이름은 .mp4 로 바뀐다', async () => {
    await createVideo({ v: 2, videoCompat: COMPAT_KEY, originalPlayable: false }, 'C0012.MTS')
    const payload = await verifyDownloadToken(tokenFrom((await mint('auto')).body))
    expect(payload.filename).toBe('C0012.mp4')
  })

  test('사진은 auto 여도 원본 경로 그대로다', async () => {
    await db.prisma.asset.create({
      data: {
        id: ASSET,
        familyId: FAMILY,
        uploadedByUserId: USER,
        kind: 'image',
        originalKey: `families/${FAMILY}/assets/${ASSET}/original`,
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(100),
        sha256: ''.padEnd(64, '0'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
        derivatives: { v: 2 },
      },
    })
    const payload = await verifyDownloadToken(tokenFrom((await mint('auto')).body))
    expect(payload.quality).toBe('original')
    expect(payload.mimeType).toBe('image/jpeg')
  })
})
