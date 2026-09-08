import type { AssetUrls, DerivativeTrio } from '@bebe/media-client'

/**
 * 그리드가 실제로 그리는 것만 담은 좁힌 URL 묶음 — 썸네일 2티어(srcset 이 256/512 를
 * 함께 고른다), blurhash·대표색·비율, 영상 포스터. 그릴 게 원본밖에 없는 레거시 자산의
 * 원본은 남는다.
 *
 * 키를 지우는 대신 뷰어 전용 티어를 `null` 로 **못 박아** `AssetUrls` 의 부분집합 타입으로
 * 둔다. 그래서 ⓐ 좁힌 값을 아직 `AssetUrls` 로 선언된 자리(타임라인 그리드·스토리 카드)에
 * 그대로 넣을 수 있고, ⓑ `GridAssetUrls` 로 받은 코드에서 `pickDisplayUrl` 을 부르면
 * 타입이 "여긴 null 이다"를 먼저 알려준다.
 */
export type GridAssetUrls = Pick<
  AssetUrls,
  | 'blurhash'
  | 'dominantColor'
  | 'aspectRatio'
  | 'thumb256'
  | 'thumb512'
  | 'videoPoster'
  | 'expiresAt'
> & {
  /** 그리드에 표시할 파생물이 하나도 없는 자산(레거시 v1 · 처리 중)의 마지막 폴백. */
  original: string | null
  display1080: null
  videoCompat: null
}

/**
 * 그리드로 내려보낼 URL 만 남긴다. 미디어에 `tiers: ['thumb', 'video']` 로 물었으면
 * 대부분 이미 null 이지만, 캐시에 남은 전 티어 응답이 그대로 RSC 페이로드에 실려 나가는
 * 것도 여기서 막는다.
 */
export function toGridUrls(
  urls: GridAssetUrls | AssetUrls | null | undefined,
): GridAssetUrls | null {
  if (!urls) return null
  const hasRenderable =
    urls.thumb256 !== null || urls.thumb512 !== null || urls.videoPoster !== null
  return {
    blurhash: urls.blurhash,
    dominantColor: urls.dominantColor,
    aspectRatio: urls.aspectRatio,
    thumb256: urls.thumb256,
    thumb512: urls.thumb512,
    videoPoster: urls.videoPoster,
    original: hasRenderable ? null : urls.original,
    display1080: null,
    videoCompat: null,
    expiresAt: urls.expiresAt,
  }
}

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

export type ThumbSrcSet = { avif: string; webp: string; jpeg: string }

/**
 * 그리드 썸네일용 srcset — thumb256 과 thumb512 를 폭 서술자(`256w`/`512w`)로 묶는다.
 * 브라우저가 `sizes` 와 DPR 로 둘 중 하나를 고른다(고밀도 화면이 256 을 늘려 흐릿하게
 * 보이던 것을 512 가 대신한다). 한 티어만 있으면 그것만, 둘 다 없으면 null.
 */
export function pickThumbSrcSet(urls: AssetUrls | null | undefined): ThumbSrcSet | null {
  if (!urls) return null
  const tiers = [
    [urls.thumb256, 256],
    [urls.thumb512, 512],
  ].filter((t): t is [DerivativeTrio, number] => t[0] !== null)
  if (tiers.length === 0) return null
  const join = (format: keyof DerivativeTrio) =>
    tiers.map(([trio, width]) => `${trio[format]} ${width}w`).join(', ')
  return { avif: join('avif'), webp: join('webp'), jpeg: join('jpeg') }
}

/** 타임라인 그리드의 열 수(3 → 4 → 5 → … → xl 에서 ~160px)에 맞춘 sizes. */
export const GRID_THUMB_SIZES =
  '(min-width: 1280px) 160px, (min-width: 768px) 20vw, (min-width: 640px) 25vw, 33vw'

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
