import { buildApp } from '@/server'
import { beforeAll, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)

describe('GET /media/v1/progress/sse', () => {
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.MEDIA_SERVICE_TOKEN = 'b'.repeat(40)
  })

  test('401 without token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/progress/sse?assetId=11111111-1111-1111-1111-111111111111',
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('400 without assetId query', async () => {
    const { signUploadToken } = await import('@/lib/jwt')
    const token = await signUploadToken({
      sub: '11111111-1111-1111-1111-111111111111',
      familyId: '22222222-2222-2222-2222-222222222222',
      assetId: '33333333-3333-3333-3333-333333333333',
      mime: 'image/jpeg',
      maxBytes: 1,
      convertToCompatible: false,
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/progress/sse',
      headers: { authorization: `Bearer ${token}` },
    })
    expect([400, 422]).toContain(res.statusCode)
    await app.close()
  })

  test('403 on assetId mismatch', async () => {
    const { signUploadToken } = await import('@/lib/jwt')
    const token = await signUploadToken({
      sub: '11111111-1111-1111-1111-111111111111',
      familyId: '22222222-2222-2222-2222-222222222222',
      assetId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      mime: 'image/jpeg',
      maxBytes: 1,
      convertToCompatible: false,
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/media/v1/progress/sse?assetId=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })
})
