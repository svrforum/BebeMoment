import { SignJWT, jwtVerify } from 'jose'

export type UploadTokenPayload = {
  iss: 'web'
  aud: 'media'
  sub: string
  familyId: string
  assetId: string
  scope: 'tus-upload'
  mime: string
  maxBytes: number
  convertToCompatible: boolean
  v: 1
}

export type SignUploadTokenArgs = Omit<UploadTokenPayload, 'iss' | 'aud' | 'scope' | 'v'>

const UPLOAD_TOKEN_TTL_SEC = 15 * 60

function getSecret(): Uint8Array {
  const raw = process.env.MEDIA_JWT_SECRET
  if (!raw || raw.length < 32) {
    throw new Error('MEDIA_JWT_SECRET must be at least 32 bytes')
  }
  return new TextEncoder().encode(raw)
}

export async function signUploadToken(args: SignUploadTokenArgs): Promise<string> {
  const payload: UploadTokenPayload = {
    iss: 'web',
    aud: 'media',
    scope: 'tus-upload',
    v: 1,
    sub: args.sub,
    familyId: args.familyId,
    assetId: args.assetId,
    mime: args.mime,
    maxBytes: args.maxBytes,
    convertToCompatible: args.convertToCompatible,
  }
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${UPLOAD_TOKEN_TTL_SEC}s`)
    .sign(getSecret())
}

export async function verifyUploadToken(token: string): Promise<UploadTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    audience: 'media',
    issuer: 'web',
  })
  if (payload.scope !== 'tus-upload' || payload.v !== 1) {
    throw new Error('invalid upload token shape')
  }
  return payload as unknown as UploadTokenPayload
}
