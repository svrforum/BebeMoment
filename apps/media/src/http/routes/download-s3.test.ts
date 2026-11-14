import { createHash } from 'node:crypto'
import { S3Adapter } from '@bebe/storage'
import { TEST_S3_CREDENTIALS, type TestS3, startTestS3 } from '@bebe/storage/src/test-s3'
import { type SignDownloadArgs, signDownloadToken } from '@/lib/jwt'
import { buildApp } from '@/server'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const FAMILY = 'fam'
const ASSET = 'asset'
const ORIGINAL_KEY = `families/${FAMILY}/assets/${ASSET}/original`
const BUCKET = 'bebe-download'

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function tokenFor(quality: SignDownloadArgs['quality']): Promise<string> {
  return signDownloadToken({
    familyId: FAMILY,
    assetId: ASSET,
    originalKey: ORIGINAL_KEY,
    kind: 'image',
    quality,
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
  })
}

// 로컬 스토리지와 같은 약속을 S3 에서도 지키는지 — 예전엔 S3 면 기본 저장(gallery)이 메타 제거
// 전에 원본으로 리다이렉트돼 촬영일·GPS 가 그대로 따라 나갔다(이슈 #45 의 4번).
describe('GET /media/v1/download/:signed — STORAGE_MODE=s3', () => {
  let s3: TestS3 | undefined
  let originalBytes: Buffer

  beforeAll(async () => {
    s3 = await startTestS3()
    process.env.MEDIA_JWT_SECRET = 'a'.repeat(40)
    process.env.STORAGE_MODE = 's3'
    process.env.STORAGE_S3_ENDPOINT = s3.endpoint
    process.env.STORAGE_S3_BUCKET = BUCKET
    process.env.STORAGE_S3_ACCESS_KEY = TEST_S3_CREDENTIALS.accessKey
    process.env.STORAGE_S3_SECRET_KEY = TEST_S3_CREDENTIALS.secretKey
    process.env.STORAGE_S3_REGION = TEST_S3_CREDENTIALS.region

    const bucket = new S3Adapter({
      mode: 's3',
      endpoint: s3.endpoint,
      bucket: BUCKET,
      ...TEST_S3_CREDENTIALS,
      forcePathStyle: true,
    })
    await bucket.createBucket()
    originalBytes = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 90, g: 40, b: 160 } },
    })
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'bebe', Model: 'cam' } } })
      .jpeg({ quality: 90 })
      .toBuffer()
    await bucket.writeBuffer(ORIGINAL_KEY, originalBytes)
  }, 120_000)

  afterAll(async () => {
    await s3?.stop()
  })

  test('gallery re-encodes here too — orientation baked in, EXIF dropped, no redirect', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor('gallery')}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['content-disposition']).toContain('photo.jpg')
    const meta = await sharp(res.rawPayload).metadata()
    expect(meta.width).toBe(900)
    expect(meta.height).toBe(1600)
    expect(meta.orientation).toBeUndefined()
    expect(meta.exif).toBeUndefined()
    await app.close()
  })

  test('original redirects to the stored bytes, EXIF intact', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor('original')}`,
    })
    expect(res.statusCode).toBe(302)
    const stored = Buffer.from(await (await fetch(String(res.headers.location))).arrayBuffer())
    expect(sha256(stored)).toBe(sha256(originalBytes))
    await app.close()
  })
})
