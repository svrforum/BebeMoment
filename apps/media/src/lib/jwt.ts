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
export const FILE_SERVE_TTL_SEC = 60 * 60
// iat 를 15분 창 시작으로 내림해 같은 창 안에서 서명한 키는 글자까지 같은 URL 이 된다 —
// 초 단위 iat 는 URL 을 매초 바꿔 브라우저 캐시를 무력화했다(업로드 뒤 격자 전체 재요청,
// 뷰어 스와이프마다 1080px 재다운로드). exp 는 창 시작 + TTL + 창 길이라 창의 마지막 초에
// 서명해도 TTL 만큼은 유효하다.
export const FILE_SERVE_WINDOW_SEC = 15 * 60

export type SignFileServeArgs = Omit<FileServeTokenPayload, 'iss' | 'aud' | 'scope' | 'v'>

export async function signFileServeToken(
  args: SignFileServeArgs,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: FileServeTokenPayload = {
    iss: 'media',
    aud: 'media',
    scope: 'file-serve',
    v: 1,
    familyId: args.familyId,
    assetId: args.assetId,
    key: args.key,
  }
  const iat = Math.floor(nowSec / FILE_SERVE_WINDOW_SEC) * FILE_SERVE_WINDOW_SEC
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(iat + FILE_SERVE_TTL_SEC + FILE_SERVE_WINDOW_SEC)
    .sign(getSecret())
}

export type VerifiedFileServeToken = FileServeTokenPayload & { exp: number }

export async function verifyFileServeToken(token: string): Promise<VerifiedFileServeToken> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ['HS256'],
    audience: 'media',
    issuer: 'media',
  })
  if (payload.scope !== 'file-serve' || payload.v !== 1 || typeof payload.exp !== 'number') {
    throw new Error('invalid file-serve token shape')
  }
  return payload as unknown as VerifiedFileServeToken
}

// ─── Download Token ──────────────────────────────────────────
// 사용자 다운로드용 — 결정된 품질과 서빙할 키를 토큰에 박아 두어
// 다운로드 라우트가 DB 조회 없이 즉시 응답할 수 있게 한다.

export type DownloadTokenPayload = {
  iss: 'media'
  aud: 'media'
  scope: 'download'
  v: 1
  familyId: string
  assetId: string
  originalKey: string
  videoCompatKey?: string
  kind: 'image' | 'video'
  // original = 저장된 바이트 그대로. gallery = JPEG 를 회전 굽기·EXIF 제거로 재인코딩(auto
  // 저장의 기본). compat = 워커가 만들어 둔 호환 영상. (제거된 hd/sd 로 발급된 토큰은
  // 다운로드 라우트가 살아있는 품질로 접는다 — download.ts 의 effectiveQuality.)
  quality: 'original' | 'gallery' | 'compat'
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
