import type { AssetUrls } from '@bebe/media-client'

// Phase C-1: only `original` is populated. Thumb/display tiers arrive in C-2.
export function pickDisplayUrl(urls: AssetUrls | null | undefined): string | null {
  if (!urls) return null
  return urls.display1080?.jpeg ?? urls.original
}

export function pickThumbUrl(urls: AssetUrls | null | undefined): string | null {
  if (!urls) return null
  return urls.thumb256?.jpeg ?? urls.thumb512?.jpeg ?? urls.original
}

export function pickVideoPosterUrl(urls: AssetUrls | null | undefined): string | null {
  if (!urls) return null
  return urls.videoPoster ?? null
}
