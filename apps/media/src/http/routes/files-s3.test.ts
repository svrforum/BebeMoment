import { signImageAccess } from '@/lib/image-access'
import { signFileServeToken } from '@/lib/jwt'
import { buildApp } from '@/server'
import { S3Adapter } from '@bebe/storage'
import { TEST_S3_CREDENTIALS, type TestS3, startTestS3 } from '@bebe/storage/src/test-s3'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const FAMILY = '22222222-2222-4222-8222-222222222222'
const ASSET = '33333333-3333-4333-8333-333333333333'
const THUMB_KEY = `derivatives/${ASSET}/thumb256.webp`
const ORIGINAL_KEY = `families/${FAMILY}/assets/${ASSET}/original.jpg`
const BUCKET = 'bebe-files'

// S3 모드에서는 바이트를 직접 내보내지 않고 버킷의 서명 주소로 넘긴다. 두 라우트가 같은
// 코드(http/send-stored-file.ts)를 타므로 둘 다 본다 — 토큰 검증은 리다이렉트보다 먼저다.
describe('file serving — STORAGE_MODE=s3', () => {
  let s3: TestS3 | undefined

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
    await bucket.writeBuffer(THUMB_KEY, Buffer.from('thumb-in-bucket'), 'image/webp')
    await bucket.writeBuffer(ORIGINAL_KEY, Buffer.from('original-in-bucket'), 'image/jpeg')
  }, 120_000)

  afterAll(async () => {
    await s3?.stop()
  })

  async function get(url: string) {
    const app = buildApp()
    try {
      return await app.inject({ method: 'GET', url })
    } finally {
      await app.close()
    }
  }

  test('an image URL redirects to a signed bucket URL that serves the derivative', async () => {
    const res = await get(`/media/v1/img/${ASSET}/thumb256.webp/${signImageAccess(ASSET)}`)
    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(new URL(location).pathname).toContain(THUMB_KEY)
    const bytes = await fetch(location)
    expect(bytes.status).toBe(200)
    expect(await bytes.text()).toBe('thumb-in-bucket')
  })

  test('a file URL redirects the same way', async () => {
    const jwt = await signFileServeToken({ familyId: FAMILY, assetId: ASSET, key: ORIGINAL_KEY })
    const res = await get(`/media/v1/files/${jwt}`)
    expect(res.statusCode).toBe(302)
    const bytes = await fetch(res.headers.location as string)
    expect(await bytes.text()).toBe('original-in-bucket')
  })

  test('a bad token or an unlisted name is refused before any redirect', async () => {
    const bad = await get(`/media/v1/img/${ASSET}/thumb256.webp/1800004500.${'A'.repeat(43)}`)
    expect(bad.statusCode).toBe(401)
    expect(bad.headers.location).toBeUndefined()
    const name = await get(`/media/v1/img/${ASSET}/original.jpg/${signImageAccess(ASSET)}`)
    expect(name.statusCode).toBe(401)
    expect(name.headers.location).toBeUndefined()
  })
})
