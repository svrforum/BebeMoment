import type { AssetUrls, DerivativeTrio } from '@bebe/media-client'

// Phase C-1: only `original` is populated. Thumb/display tiers arrive in C-2.
export function pickDisplayUrl(urls: AssetUrls | null | undefined): string | null {
  if (!urls) return null
  return urls.display1080?.jpeg ?? urls.original
}

export function pickThumbUrl(urls: AssetUrls | null | undefined): string | null {
  if (!urls) return null
  return (
    urls.thumb256?.jpeg ??
    urls.thumb512?.jpeg ??
    // Legacy videos have only videoPoster — use it as a thumb fallback.
    urls.videoPoster ??
    urls.original
  )
}

export function pickVideoPosterUrl(urls: AssetUrls | null | undefined): string | null {
  if (!urls) return null
  return urls.videoPoster ?? null
}

/**
 * 동영상 재생 URL. 워커가 만든 H.264 호환본(videoCompat=preview.mp4) 우선, 없으면
 * (레거시) 원본. <video src> 에는 절대 pickDisplayUrl(=JPEG 이미지) 을 쓰지 말 것.
 */
export function pickVideoUrl(urls: AssetUrls | null | undefined): string | null {
  if (!urls) return null
  return urls.videoCompat ?? urls.original ?? null
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

/**
 * blurhash 문자열. 미디어 서버가 모든 자산에 대해 인코딩해 보냄.
 * 레거시 자산은 null 가능. <PictureImage> 의 placeholder 모자이크에 사용.
 */
export function pickBlurhash(urls: AssetUrls | null | undefined): string | null {
  return urls?.blurhash ?? null
}
