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
  notify?: boolean
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
    notify: args.notify ?? true,
  }
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${UPLOAD_TOKEN_TTL_SEC}s`)
    .sign(getSecret())
}

export async function verifyUploadToken(token: string): Promise<UploadTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
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

// 서명 URL 이 브라우저에 박힌 채(클라이언트 라우터 캐시·오래 열어둔 앱·bfcache·지연로딩)
// 만료돼 썸네일이 401 로 깨지던 걸 줄이려 1시간으로 둔다. 페이지는 동적 렌더라 매 요청 새로
// 발급되고, 잔여 만료는 PictureImage 의 onError 자동 재조회가 복구한다.
const FILE_SERVE_TTL_SEC = 60 * 60

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
    algorithms: ['HS256'],
    audience: 'media',
    issuer: 'media',
  })
  if (payload.scope !== 'file-serve' || payload.v !== 1) {
    throw new Error('invalid file-serve token shape')
  }
  return payload as unknown as FileServeTokenPayload
}

// ─── Download Token ──────────────────────────────────────────
// 사용자 다운로드용 — original / hd / sd 품질을 토큰에 박아 두어
// 다운로드 라우트가 DB 조회 없이 즉시 응답할 수 있게 한다.

export type DownloadTokenPayload = {
  iss: 'media'
  aud: 'media'
  scope: 'download'
  v: 1
  familyId: string
  assetId: string
  originalKey: string
  hdImageKey?: string
  videoCompatKey?: string
  kind: 'image' | 'video'
  quality: 'original' | 'compat' | 'hd' | 'sd'
  filename: string
  mimeType: string
}

const DOWNLOAD_TTL_SEC = 10 * 60

export type SignDownloadArgs = Omit<DownloadTokenPayload, 'iss' | 'aud' | 'scope' | 'v'>

export async function signDownloadToken(args: SignDownloadArgs): Promise<string> {
  const payload: DownloadTokenPayload = {
    iss: 'media',
    aud: 'media',
    scope: 'download',
    v: 1,
    familyId: args.familyId,
    assetId: args.assetId,
    originalKey: args.originalKey,
    ...(args.hdImageKey !== undefined ? { hdImageKey: args.hdImageKey } : {}),
    ...(args.videoCompatKey !== undefined ? { videoCompatKey: args.videoCompatKey } : {}),
    kind: args.kind,
    quality: args.quality,
    filename: args.filename,
    mimeType: args.mimeType,
  }
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DOWNLOAD_TTL_SEC}s`)
    .sign(getSecret())
}

export async function verifyDownloadToken(token: string): Promise<DownloadTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
    audience: 'media',
    issuer: 'media',
  })
  if (payload.scope !== 'download' || payload.v !== 1) {
    throw new Error('invalid download token shape')
  }
  return payload as unknown as DownloadTokenPayload
}
