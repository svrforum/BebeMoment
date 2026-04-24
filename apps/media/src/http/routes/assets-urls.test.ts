import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { buildApp } from '@/server'

const SECRET = 'a'.repeat(40)
const TOKEN = 'b'.repeat(40)

describe('GET /media/v1/assets/:id/urls', () => {
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

  test('401 without service token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/assets/22222222-2222-2222-2222-222222222222/urls?familyId=11111111-1111-1111-1111-111111111111',
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('404 when asset does not exist', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/assets/22222222-2222-2222-2222-222222222222/urls?familyId=11111111-1111-1111-1111-111111111111',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  test('200 with valid asset returns AssetUrls', async () => {
    await db.prisma.asset.create({
      data: {
        id: '22222222-2222-2222-2222-222222222222',
        familyId: '11111111-1111-1111-1111-111111111111',
        uploadedByUserId: '33333333-3333-3333-3333-333333333333',
        kind: 'image',
        originalKey:
          'families/11111111-1111-1111-1111-111111111111/assets/22222222-2222-2222-2222-222222222222/original',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(100),
        sha256: ''.padEnd(64, '0'),
        width: 1920,
        height: 1080,
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
      },
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/assets/22222222-2222-2222-2222-222222222222/urls?familyId=11111111-1111-1111-1111-111111111111',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.v).toBe(1)
    expect(body.urls.original).toContain('/media/v1/files/')
    expect(body.urls.aspectRatio).toBeCloseTo(1920 / 1080, 4)
    await app.close()
  })

  test('404 when asset belongs to different family', async () => {
    await db.prisma.asset.create({
      data: {
        id: '22222222-2222-2222-2222-222222222222',
        familyId: '11111111-1111-1111-1111-111111111111',
        uploadedByUserId: '33333333-3333-3333-3333-333333333333',
        kind: 'image',
        originalKey: 'x',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(100),
        sha256: ''.padEnd(64, '0'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
      },
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/assets/22222222-2222-2222-2222-222222222222/urls?familyId=99999999-9999-9999-9999-999999999999',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
