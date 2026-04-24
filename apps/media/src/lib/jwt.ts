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

// ─── File Serve Token ────────────────────────────────────────

export type FileServeTokenPayload = {
  iss: 'media'
  aud: 'media'
  familyId: string
  assetId: string
  key: string
  scope: 'file-serve'
  v: 1
}

const FILE_SERVE_TTL_SEC = 10 * 60

export type SignFileServeArgs = Omit<FileServeTokenPayload, 'iss' | 'aud' | 'scope' | 'v'>

export async function signFileServeToken(args: SignFileServeArgs): Promise<string> {
  const payload: FileServeTokenPayload = {
    iss: 'media',
    aud: 'media',
    scope: 'file-serve',
    v: 1,
    familyId: args.familyId,
    assetId: args.assetId,
    key: args.key,
  }
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${FILE_SERVE_TTL_SEC}s`)
    .sign(getSecret())
}

export async function verifyFileServeToken(token: string): Promise<FileServeTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    audience: 'media',
    issuer: 'media',
  })
  if (payload.scope !== 'file-serve' || payload.v !== 1) {
    throw new Error('invalid file-serve token shape')
  }
  return payload as unknown as FileServeTokenPayload
}
