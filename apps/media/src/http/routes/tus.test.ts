import { getTusStore } from '@/lib/tus-store'
import { buildApp } from '@/server'
import { Upload } from '@tus/server'
import { beforeAll, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const SERVICE_TOKEN = 'b'.repeat(40)

async function uploadTokenFor(assetId: string, maxBytes: number): Promise<string> {
  const { signUploadToken } = await import('@/lib/jwt')
  return signUploadToken({
    sub: '11111111-1111-1111-1111-111111111111',
    familyId: '22222222-2222-2222-2222-222222222222',
    assetId,
    mime: 'image/jpeg',
    maxBytes,
    convertToCompatible: false,
  })
}

describe('tus route limits and resume', () => {
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.MEDIA_SERVICE_TOKEN = SERVICE_TOKEN
  })

  test('413 when Upload-Length exceeds the maxBytes declared in the upload token', async () => {
    const assetId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    const token = await uploadTokenFor(assetId, 100)
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/tus',
      headers: {
        'tus-resumable': '1.0.0',
        'upload-length': '101',
        authorization: `Bearer ${token}`,
      },
    })
    expect(res.statusCode).toBe(413)
    await app.close()
  })

  test('a GET carrying Tus-Resumable is answered as HEAD (proxies rewrite HEAD to GET)', async () => {
    const assetId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    await getTusStore().create(
      new Upload({ id: assetId, size: 100, offset: 0, metadata: { filename: 'a.jpg' } }),
    )
    const token = await uploadTokenFor(assetId, 100)
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/tus/${assetId}`,
      headers: { 'tus-resumable': '1.0.0', authorization: `Bearer ${token}` },
    })
    expect([200, 204]).toContain(res.statusCode)
    expect(res.headers['upload-offset']).toBe('0')
    expect(res.headers['upload-length']).toBe('100')
    expect(res.body).toBe('')
    await app.close()
  })
})

describe('tus route auth', () => {
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.MEDIA_SERVICE_TOKEN = SERVICE_TOKEN
  })

  test('rejects request without upload token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/tus/abc',
      headers: { 'tus-resumable': '1.0.0' },
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('rejects request with mismatched assetId in path', async () => {
    const { signUploadToken } = await import('@/lib/jwt')
    const token = await signUploadToken({
      sub: '11111111-1111-1111-1111-111111111111',
      familyId: '22222222-2222-2222-2222-222222222222',
      assetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      mime: 'image/jpeg',
      maxBytes: 100,
      convertToCompatible: false,
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/media/v1/tus/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      headers: {
        'tus-resumable': '1.0.0',
        authorization: `Bearer ${token}`,
      },
    })
    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('FAMILY_MISMATCH')
    await app.close()
  })
})
