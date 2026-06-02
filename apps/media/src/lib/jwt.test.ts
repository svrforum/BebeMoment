import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { signFileServeToken, signUploadToken, verifyFileServeToken, verifyUploadToken } from './jwt'

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

  test('verify rejects a token signed with a different HMAC algorithm (HS512)', async () => {
    const { SignJWT } = await import('jose')
    const token = await new SignJWT({
      scope: 'tus-upload',
      v: 1,
      sub: 'a',
      familyId: 'b',
      assetId: 'c',
      mime: 'image/jpeg',
      maxBytes: 1,
      convertToCompatible: false,
    })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuedAt()
      .setIssuer('web')
      .setAudience('media')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(SECRET))
    await expect(verifyUploadToken(token)).rejects.toThrow()
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

describe('file-serve token', () => {
  const orig = process.env.MEDIA_JWT_SECRET
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = 'a'.repeat(40)
  })
  afterAll(() => {
    process.env.MEDIA_JWT_SECRET = orig
  })

  test('sign + verify roundtrip', async () => {
    const token = await signFileServeToken({
      familyId: '11111111-1111-1111-1111-111111111111',
      assetId: '22222222-2222-2222-2222-222222222222',
      key: 'families/fam/assets/asset/original',
    })
    const payload = await verifyFileServeToken(token)
    expect(payload.scope).toBe('file-serve')
    expect(payload.iss).toBe('media')
    expect(payload.key).toBe('families/fam/assets/asset/original')
  })

  test('upload token is rejected by file-serve verify', async () => {
    const uploadToken = await signUploadToken({
      sub: '11111111-1111-1111-1111-111111111111',
      familyId: '22222222-2222-2222-2222-222222222222',
      assetId: '33333333-3333-3333-3333-333333333333',
      mime: 'image/jpeg',
      maxBytes: 1,
      convertToCompatible: false,
    })
    await expect(verifyFileServeToken(uploadToken)).rejects.toThrow()
  })

  test('file-serve token is rejected by upload verify', async () => {
    const fileToken = await signFileServeToken({
      familyId: '11111111-1111-1111-1111-111111111111',
      assetId: '22222222-2222-2222-2222-222222222222',
      key: 'x',
    })
    await expect(verifyUploadToken(fileToken)).rejects.toThrow()
  })
})
