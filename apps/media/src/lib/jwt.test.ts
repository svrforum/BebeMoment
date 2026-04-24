import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { signUploadToken, verifyUploadToken } from './jwt'

const SECRET = 'a'.repeat(40)

describe('upload token', () => {
  const orig = process.env.MEDIA_JWT_SECRET
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
  })
  afterAll(() => {
    process.env.MEDIA_JWT_SECRET = orig
  })

  test('sign + verify roundtrip', async () => {
    const token = await signUploadToken({
      sub: '11111111-1111-1111-1111-111111111111',
      familyId: '22222222-2222-2222-2222-222222222222',
      assetId: '33333333-3333-3333-3333-333333333333',
      mime: 'image/jpeg',
      maxBytes: 10_000_000,
      convertToCompatible: false,
    })
    const payload = await verifyUploadToken(token)
    expect(payload.familyId).toBe('22222222-2222-2222-2222-222222222222')
    expect(payload.assetId).toBe('33333333-3333-3333-3333-333333333333')
    expect(payload.scope).toBe('tus-upload')
    expect(payload.convertToCompatible).toBe(false)
  })

  test('short secret rejected on sign', async () => {
    process.env.MEDIA_JWT_SECRET = 'short'
    await expect(
      signUploadToken({
        sub: 'a',
        familyId: 'b',
        assetId: 'c',
        mime: 'image/jpeg',
        maxBytes: 1,
        convertToCompatible: false,
      }),
    ).rejects.toThrow(/32 bytes/)
    process.env.MEDIA_JWT_SECRET = SECRET
  })

  test('verify rejects mismatched signature', async () => {
    const token = await signUploadToken({
      sub: 'a',
      familyId: 'b',
      assetId: 'c',
      mime: 'image/jpeg',
      maxBytes: 1,
      convertToCompatible: false,
    })
    process.env.MEDIA_JWT_SECRET = 'b'.repeat(40)
    await expect(verifyUploadToken(token)).rejects.toThrow()
    process.env.MEDIA_JWT_SECRET = SECRET
  })
})
