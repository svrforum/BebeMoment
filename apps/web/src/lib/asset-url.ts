import type { AssetUrls, DerivativeTrio } from '@bebe/media-client'

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

/**
 * 썸네일 trio (avif/webp/jpeg). Phase C-2 부터 채워짐. 레거시 자산은 null.
 * 사용처: 타임라인 카드, 캘린더 셀 — <picture> 태그용.
 */
export function pickThumbTrio(urls: AssetUrls | null | undefined): DerivativeTrio | null {
  if (!urls) return null
  return urls.thumb256 ?? urls.thumb512 ?? null
}

/**
 * 큰 이미지 trio. 디테일 페이지용.
 */
export function pickDisplayTrio(urls: AssetUrls | null | undefined): DerivativeTrio | null {
  if (!urls) return null
  return urls.display1080 ?? urls.thumb512 ?? null
}
