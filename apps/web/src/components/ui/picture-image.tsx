'use client'
import type { DerivativeTrio } from '@bebe/media-client'
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
}: PictureImageProps) {
  const [loaded, setLoaded] = useState(false)

  // When the image is served from cache it can finish loading before React
  // attaches onLoad, so the load event never fires and the image stays at
  // opacity 0 (only the blurhash shows). Detect the already-complete case in
  // the ref callback and reveal it immediately.
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true)
  }, [])

  // Empty: no image data at all.
  if (!trio && !fallbackUrl) {
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

  if (!trio) {
    return (
      <span className={className} style={wrapperStyle}>
        {blurhash && <BlurhashCanvas hash={blurhash} aspect={aspectRatio} />}
        <img
          ref={imgRef}
          src={fallbackUrl ?? ''}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={onLoad}
          style={imgStyle}
        />
      </span>
    )
  }

  return (
    <span className={className} style={wrapperStyle}>
      {blurhash && <BlurhashCanvas hash={blurhash} aspect={aspectRatio} />}
      <picture>
        <source srcSet={trio.avif} type="image/avif" />
        <source srcSet={trio.webp} type="image/webp" />
        <img
          ref={imgRef}
          src={trio.jpeg}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={onLoad}
          style={imgStyle}
        />
      </picture>
    </span>
  )
}
