import { SignJWT } from 'jose'
import type { FastifyRequest } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MediaHttpError } from './error-handler'
import { extractUploadToken } from './upload-token'

const SECRET = 'a'.repeat(40)
const key = new TextEncoder().encode(SECRET)

function reqWith(token: string): FastifyRequest {
  return { headers: { authorization: `Bearer ${token}` }, query: {} } as unknown as FastifyRequest
}

describe('extractUploadToken expiry classification', () => {
  const orig = process.env.MEDIA_JWT_SECRET
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
  })
  afterAll(() => {
    process.env.MEDIA_JWT_SECRET = orig
  })

  it('classifies an expired token as UPLOAD_TOKEN_EXPIRED (retriable)', async () => {
    const token = await new SignJWT({ scope: 'tus-upload', v: 1, assetId: 'a', familyId: 'f' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('web')
      .setAudience('media')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 100)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(key)
    const err = await extractUploadToken(reqWith(token)).catch((e) => e)
    expect(err).toBeInstanceOf(MediaHttpError)
    expect((err as MediaHttpError).code).toBe('UPLOAD_TOKEN_EXPIRED')
    expect((err as MediaHttpError).retriable).toBe(true)
  })

  it('does NOT misclassify a wrong-audience token as expired (message contains "unexpected")', async () => {
    // jose throws `unexpected "aud" claim value` — substring "exp" must not flip
    // this to EXPIRED/retriable. It is an invalid token, not an expired one.
    const token = await new SignJWT({ scope: 'tus-upload', v: 1, assetId: 'a', familyId: 'f' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('web')
      .setAudience('evil')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(key)
    const err = await extractUploadToken(reqWith(token)).catch((e) => e)
    expect(err).toBeInstanceOf(MediaHttpError)
    expect((err as MediaHttpError).code).toBe('UPLOAD_TOKEN_INVALID')
    expect((err as MediaHttpError).retriable).toBe(false)
  })
})
