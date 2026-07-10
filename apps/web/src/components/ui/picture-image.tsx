'use client'
import { pickDisplayTrio, pickDisplayUrl, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetUrls, DerivativeTrio } from '@bebe/media-client'
import { decode } from 'blurhash'
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

export type PictureImageProps = {
  trio: DerivativeTrio | null
  fallbackUrl: string | null
  alt: string
  width?: number
  height?: number
  aspectRatio?: number | null
  dominantColor?: string | null
  blurhash?: string | null
  className?: string
  style?: CSSProperties
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
  /** Inner img object-fit. Default 'cover'. Use 'contain' for viewer. */
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  /** Inner img object-position (e.g. '50% 30%'). 얼굴 커버처럼 bbox 중심으로 크롭할 때. */
  objectPosition?: string
  /** Blurhash 페이드인(opacity 0→1 240ms). 기본 true. 뷰어처럼 형제 슬라이드가 미리
   *  디코드돼 있고 슬롯이 비디오↔이미지로 교체되는 곳에선 false 로 꺼서, 새 PictureImage
   *  가 마운트될 때 페이드가 재생돼 "깜빡임"으로 보이는 걸 막는다. 끄면 dominantColor·
   *  blurhash 배경이 뒤를 덮은 채 이미지가 즉시 드러난다(페이드 없음). */
  fade?: boolean
  /** 서명 URL 만료(401)로 이미지가 깨질 때 자가치유용 asset id. 주면 onError 에서
   *  `/api/assets/urls` 로 신선한 서명 URL 을 한 번 재조회해 교체한다. 없으면 자가치유 안 함. */
  assetId?: string | undefined
  /** 재조회 시 다시 고를 티어. 기본 'thumb'(그리드 썸네일). 뷰어/상세는 'display'. */
  urlKind?: 'thumb' | 'display'
}

function BlurhashCanvas({ hash, aspect }: { hash: string; aspect: number | null | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [shouldDecode, setShouldDecode] = useState(false)

  // Defer the (CPU-heavy) blurhash decode until the canvas approaches the
  // viewport — was running synchronously for every grid card on mount,
  // which blocked the main thread on 100-photo timelines. dominant-color
  // background fills in instantly via the wrapper's CSS background, so
  // off-screen cards still look right.
  useEffect(() => {
    if (!ref.current) return
    const node = ref.current
    if (typeof IntersectionObserver === 'undefined') {
      setShouldDecode(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldDecode(true)
          obs.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!shouldDecode) return
    const c = ref.current
    if (!c) return
    try {
      const w = 32
      const h = aspect && aspect > 0 ? Math.max(8, Math.round(w / aspect)) : 32
      c.width = w
      c.height = h
      const pixels = decode(hash, w, h)
      const ctx = c.getContext('2d')
      if (!ctx) return
      const img = ctx.createImageData(w, h)
      img.data.set(pixels)
      ctx.putImageData(img, 0, 0)
    } catch {
      // ignore — invalid hash
    }
  }, [shouldDecode, hash, aspect])

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}

export function PictureImage({
  trio,
  fallbackUrl,
  alt,
  width,
  height,
  aspectRatio,
  dominantColor,
  blurhash,
  className,
  style,
  loading = 'lazy',
  fetchPriority = 'auto',
  objectFit = 'cover',
  objectPosition,
  fade = true,
  assetId,
  urlKind = 'thumb',
}: PictureImageProps) {
  const [loaded, setLoaded] = useState(false)
  // 서명 URL 만료로 로드 실패 시, 신선한 URL 로 한 번 교체(자가치유). null 이면 원본 props 사용.
  const [override, setOverride] = useState<{
    trio: DerivativeTrio | null
    fallbackUrl: string | null
  } | null>(null)
  const retriedRef = useRef(false)

  // When the image is served from cache it can finish loading before React
  // attaches onLoad, so the load event never fires and the image stays at
  // opacity 0 (only the blurhash shows). Detect the already-complete case in
  // the ref callback and reveal it immediately.
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true)
  }, [])

  const onError = useCallback(async () => {
    if (!assetId || retriedRef.current) return
    retriedRef.current = true
    try {
      const res = await fetch('/api/assets/urls', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [assetId] }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { urls: Record<string, AssetUrls> }
      const fresh = data.urls[assetId]
      if (!fresh) return
      setLoaded(false)
      setOverride({
        trio: urlKind === 'display' ? pickDisplayTrio(fresh) : pickThumbTrio(fresh),
        fallbackUrl: urlKind === 'display' ? pickDisplayUrl(fresh) : pickThumbUrl(fresh),
      })
    } catch {
      // best-effort — 실패하면 깨진 이미지 그대로(무한 재시도 방지: retriedRef).
    }
  }, [assetId, urlKind])

  const effTrio = override ? override.trio : trio
  const effFallback = override ? override.fallbackUrl : fallbackUrl

  // Empty: no image data at all.
  if (!effTrio && !effFallback) {
    if (blurhash) {
      return (
        <span
          className={className}
          style={{
            position: 'relative',
            display: 'block',
            overflow: 'hidden',
            aspectRatio: aspectRatio ?? undefined,
            backgroundColor: dominantColor ?? undefined,
            ...style,
          }}
          aria-label={alt}
        >
          <BlurhashCanvas hash={blurhash} aspect={aspectRatio} />
        </span>
      )
    }
    return (
      <div
        className={`${className ?? ''} bg-base-100 dark:bg-base-800`}
        style={{
          aspectRatio: aspectRatio ?? undefined,
          backgroundColor: dominantColor ?? undefined,
          ...style,
        }}
        data-empty-placeholder
        aria-label={alt}
      />
    )
  }

  const onLoad = () => setLoaded(true)

  // Wrap img in a sized span. className/style/aspectRatio land on the wrapper;
  // img stretches to 100% with object-fit. blurhash canvas sits behind.
  const wrapperStyle: CSSProperties = {
    position: 'relative',
    display: 'block',
    overflow: 'hidden',
    aspectRatio: aspectRatio ?? undefined,
    backgroundColor: dominantColor ?? undefined,
    ...style,
  }

  const imgStyle: CSSProperties = {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: '100%',
    objectFit,
    objectPosition,
    opacity: blurhash && fade ? (loaded ? 1 : 0) : 1,
    transition: blurhash && fade ? 'opacity 240ms ease-out' : undefined,
  }

  if (!effTrio) {
    return (
      <span className={className} style={wrapperStyle}>
        {blurhash && <BlurhashCanvas hash={blurhash} aspect={aspectRatio} />}
        <img
          // URL 이 바뀌면(자가치유 교체) remount 해 브라우저가 새로 로드하도록 key 를 건다.
          key={effFallback ?? ''}
          ref={imgRef}
          src={effFallback ?? ''}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={onLoad}
          onError={onError}
          style={imgStyle}
        />
      </span>
    )
  }

  return (
    <span className={className} style={wrapperStyle}>
      {blurhash && <BlurhashCanvas hash={blurhash} aspect={aspectRatio} />}
      <picture key={effTrio.jpeg}>
        <source srcSet={effTrio.avif} type="image/avif" />
        <source srcSet={effTrio.webp} type="image/webp" />
        <img
          ref={imgRef}
          src={effTrio.jpeg}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={onLoad}
          onError={onError}
          style={imgStyle}
        />
      </picture>
    </span>
  )
}
