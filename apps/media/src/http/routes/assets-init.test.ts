import { buildApp } from '@/server'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const TOKEN = 'b'.repeat(40)

const FAMILY_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'

describe('POST /media/v1/assets/init', () => {
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
    await db.prisma.assetBaby.deleteMany({ where: { asset: { familyId: FAMILY_ID } } })
    await db.prisma.asset.deleteMany({ where: { familyId: FAMILY_ID } })
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.users (id, email, password_hash, display_name, created_at, updated_at)
      VALUES ('${USER_ID}', 'test@example.com', 'x', 'Test', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `)
    await db.prisma.$executeRawUnsafe(`
      INSERT INTO public.families (id, name, slug, created_by_user_id, created_at, updated_at)
      VALUES ('${FAMILY_ID}', 'TestFam', 'testfam', '${USER_ID}', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `)
  })

  test('returns 401 without service token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/init',
      payload: {
        familyId: FAMILY_ID,
        uploaderId: USER_ID,
        mime: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'a.jpg',
      },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('returns 201 with valid service token and creates asset row', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/init',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {
        familyId: FAMILY_ID,
        uploaderId: USER_ID,
        mime: 'image/jpeg',
        sizeBytes: 100,
        originalName: 'a.jpg',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.v).toBe(1)
    expect(body.assetId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(body.tusUploadUrl).toMatch(/\/media\/v1\/tus\//)
    expect(body.uploadToken).toBeDefined()
    expect(body.expiresAt).toBeDefined()

    const asset = await db.prisma.asset.findFirst({
      where: { familyId: FAMILY_ID, id: body.assetId },
    })
    expect(asset).not.toBeNull()
    expect(asset?.status).toBe('uploading')
    expect(asset?.familyId).toBe(FAMILY_ID)
    expect(asset?.kind).toBe('image')
    await app.close()
  })

  test('returns 400 for invalid body shape', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/init',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: { garbage: true },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  test('video mime sets kind=video', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/assets/init',
      headers: { authorization: `Bearer ${TOKEN}` },
      payload: {
        familyId: FAMILY_ID,
        uploaderId: USER_ID,
        mime: 'video/mp4',
        sizeBytes: 1000,
        originalName: 'v.mp4',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    const asset = await db.prisma.asset.findFirst({
      where: { familyId: FAMILY_ID, id: body.assetId },
    })
    expect(asset?.kind).toBe('video')
    await app.close()
  })
})
