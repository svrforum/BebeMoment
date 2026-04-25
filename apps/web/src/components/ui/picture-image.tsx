'use client'
import type { DerivativeTrio } from '@bebe/media-client'
import { decode } from 'blurhash'
import { type CSSProperties, useEffect, useRef, useState } from 'react'

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
}

function BlurhashCanvas({ hash, aspect }: { hash: string; aspect: number | null | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
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
  }, [hash, aspect])
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
}: PictureImageProps) {
  const [loaded, setLoaded] = useState(false)

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
    opacity: blurhash ? (loaded ? 1 : 0) : 1,
    transition: blurhash ? 'opacity 240ms ease-out' : undefined,
  }

  if (!trio) {
    return (
      <span className={className} style={wrapperStyle}>
        {blurhash && <BlurhashCanvas hash={blurhash} aspect={aspectRatio} />}
        <img
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
