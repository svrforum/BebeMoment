import { buildApp } from '@/server'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'

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

  // 처음 심는 촬영 시각도 벽시계여야 한다 — 처리에 실패한 사진은 이 값을 그대로 달고 타임라인에 남고,
  // 워커는 파일 수정시각을 이 값에서 다시 읽는다. 운영 컨테이너는 TZ=Asia/Seoul 이다.
  describe('촬영 시각 씨앗 — 인스턴스 시간대가 Asia/Seoul 일 때', () => {
    let savedTz: string | undefined
    beforeEach(() => {
      savedTz = process.env.TZ
      process.env.TZ = 'Asia/Seoul'
    })
    afterEach(() => {
      if (savedTz === undefined) delete process.env.TZ
      else process.env.TZ = savedTz
    })

    async function seed(extra: Record<string, unknown>) {
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
          originalName: 'IMG_no_date.jpg',
          ...extra,
        },
      })
      await app.close()
      expect(res.statusCode).toBe(201)
      return db.prisma.asset.findFirst({
        where: { familyId: FAMILY_ID, id: JSON.parse(res.body).assetId },
      })
    }

    test('파일 수정시각(실제 순간)을 벽시계로 옮겨 심는다', async () => {
      // 2026-10-12 07:44 KST 에 수정된 파일 — 브라우저는 실제 순간 22:44Z 를 보낸다.
      const asset = await seed({ fileModifiedAt: '2026-10-11T22:44:00.000Z' })
      expect(asset?.takenAtSource).toBe('filemtime')
      expect(asset?.takenAt.toISOString()).toBe('2026-10-12T07:44:00.000Z')
      // 실제 순간도 따로 남긴다 — 워커·백필이 언제 다시 계산해도 같은 값이 나오게.
      expect(asset?.fileModifiedAt?.toISOString()).toBe('2026-10-11T22:44:00.000Z')
    })

    test('수정시각이 없으면 지금을 벽시계로 심는다', async () => {
      const before = Date.now()
      const asset = await seed({})
      expect(asset?.takenAtSource).toBe('uploaded')
      expect(asset?.fileModifiedAt).toBeNull()
      const nineHours = 9 * 60 * 60 * 1000
      expect(Math.abs((asset?.takenAt.getTime() ?? 0) - (before + nineHours))).toBeLessThan(10_000)
    })
  })
})
