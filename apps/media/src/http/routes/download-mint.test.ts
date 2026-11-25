import { verifyDownloadToken } from '@/lib/jwt'
import type { Prisma } from '@bebe/db-media'
import { buildApp } from '@/server'
import { type TestDb, startTestDb } from '@bebe/db-media/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const TOKEN = 'b'.repeat(40)
const FAMILY = '11111111-1111-4111-8111-111111111111'
const ASSET = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'

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

  async function createImage(mimeType: string, filename: string) {
    await db.prisma.asset.create({
      data: {
        id: ASSET,
        familyId: FAMILY,
        uploadedByUserId: USER,
        kind: 'image',
        originalKey: `families/${FAMILY}/assets/${ASSET}/original`,
        originalFilename: filename,
        mimeType,
        sizeBytes: BigInt(100),
        sha256: ''.padEnd(64, '0'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
        derivatives: { v: 2 },
      },
    })
  }

  test('중복 업로드 별칭도 내려받아진다 — 토큰은 키의 주인 자산에 묶인다', async () => {
    const canonical = '55555555-5555-4555-8555-555555555555'
    const originalKey = `families/${FAMILY}/assets/${canonical}/original.png`
    const fs = await import('node:fs')
    const path = await import('node:path')
    const full = path.join(process.env.STORAGE_PATH as string, originalKey)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, 'canonical-png-bytes')
    await db.prisma.asset.create({
      data: {
        id: ASSET,
        familyId: FAMILY,
        uploadedByUserId: USER,
        kind: 'image',
        originalKey,
        originalFilename: 'copy.png',
        mimeType: 'image/png',
        sizeBytes: BigInt(19),
        sha256: ''.padEnd(64, '1'),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
        status: 'ready',
        duplicateOf: canonical,
      },
    })
    const res = await mint('original')
    expect(res.statusCode).toBe(200)
    expect((await verifyDownloadToken(tokenFrom(res.body))).assetId).toBe(canonical)

    const app = buildApp()
    const file = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${tokenFrom(res.body)}`,
    })
    await app.close()
    expect(file.statusCode).toBe(200)
    expect(file.body).toBe('canonical-png-bytes')
  })

  test('JPEG 사진의 auto 는 갤러리용 재인코드(회전 굽기·EXIF 제거)다', async () => {
    await createImage('image/jpeg', 'a.jpg')
    const payload = await verifyDownloadToken(tokenFrom((await mint('auto')).body))
    expect(payload.quality).toBe('gallery')
    expect(payload.mimeType).toBe('image/jpeg')
    expect(payload.filename).toBe('a.jpg')
  })

  // web 은 경로만 떼어 내부 주소로 받아 온다. 오리진이 공개 주소 설정을 따라가면 별도 호스트
  // 배포에서 web 이 엉뚱한 곳을 부르는 것처럼 읽힌다 — 늘 같은 내부 오리진이다.
  test('발급 주소는 공개 주소 설정과 무관하게 내부 오리진 + 다운로드 경로다', async () => {
    await createImage('image/jpeg', 'a.jpg')
    const saved = process.env.MEDIA_PUBLIC_BASE_URL
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.example.com'
    try {
      const { url } = JSON.parse((await mint('original')).body) as { url: string }
      const parsed = new URL(url)
      expect(parsed.origin).toBe('http://localhost:3001')
      expect(parsed.pathname).toMatch(/^\/media\/v1\/download\/[^/]+$/)
    } finally {
      if (saved === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL
      else process.env.MEDIA_PUBLIC_BASE_URL = saved
    }
  })

  test('사진의 original 은 저장된 바이트 그대로다', async () => {
    await createImage('image/jpeg', 'a.jpg')
    const payload = await verifyDownloadToken(tokenFrom((await mint('original')).body))
    expect(payload.quality).toBe('original')
    expect(payload.mimeType).toBe('image/jpeg')
  })

  test('JPEG 가 아닌 사진은 auto 여도 원본이다', async () => {
    await createImage('image/png', 'a.png')
    const payload = await verifyDownloadToken(tokenFrom((await mint('auto')).body))
    expect(payload.quality).toBe('original')
    expect(payload.mimeType).toBe('image/png')
  })

  test('제거된 압축 품질(hd)은 더 이상 발급하지 않는다', async () => {
    await createImage('image/jpeg', 'a.jpg')
    const res = await mint('hd')
    expect(res.statusCode).toBe(400)
  })
})
