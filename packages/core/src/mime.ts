export type MediaKind = 'image' | 'video'

export function isImage(mime: string): boolean {
  return mime.toLowerCase().startsWith('image/')
}

export function isVideo(mime: string): boolean {
  return mime.toLowerCase().startsWith('video/')
}

export function kindOf(mime: string): MediaKind | null {
  if (isImage(mime)) return 'image'
  if (isVideo(mime)) return 'video'
  return null
}

const NEEDS_CONVERT = new Set(['image/heic', 'image/heif', 'image/avif', 'video/quicktime'])

export function needsConvert(mime: string): boolean {
  return NEEDS_CONVERT.has(mime.toLowerCase())
}

// 확장자 → MIME. 안드로이드 문서 선택기는 색인되지 않은 카메라 파일(예: A6700 XAVC)에
// application/octet-stream 이나 빈 문자열을 준다 — 그때 이름으로 메운다.
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  mts: 'video/mp2t',
  m2ts: 'video/mp2t',
}

/**
 * 이 파일을 업로드할 때 쓸 MIME. 미디어가 아니면 null — 호출부가 거부한다.
 *
 * 브라우저가 준 값이 이미 image/* · video/* 면 그대로 믿고, 모르거나(octet-stream·빈 값)
 * 하면 확장자로 판단한다. 확장자로도 미디어가 아니면 받지 않는다.
 */
export function mimeForFile(filename: string, browserMime: string | undefined): string | null {
  if (browserMime && kindOf(browserMime)) return browserMime
  const ext = filename.toLowerCase().split('.').pop()
  if (!ext || ext === filename.toLowerCase()) return null
  return EXT_MIME[ext] ?? null
}
