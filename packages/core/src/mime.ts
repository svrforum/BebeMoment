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
