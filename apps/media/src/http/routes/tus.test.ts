import { buildApp } from '@/server'
import { beforeAll, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const SERVICE_TOKEN = 'b'.repeat(40)

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
