import type { DerivativeTrio } from '@bebe/media-client'
import type { CSSProperties } from 'react'

export type PictureImageProps = {
  trio: DerivativeTrio | null
  fallbackUrl: string | null
  alt: string
  width?: number
  height?: number
  aspectRatio?: number | null
  dominantColor?: string | null
  className?: string
  style?: CSSProperties
  loading?: 'eager' | 'lazy'
  fetchPriority?: 'high' | 'low' | 'auto'
}

export function PictureImage({
  trio,
  fallbackUrl,
  alt,
  width,
  height,
  aspectRatio,
  dominantColor,
  className,
  style,
  loading = 'lazy',
  fetchPriority = 'auto',
}: PictureImageProps) {
  const baseStyle: CSSProperties = {
    aspectRatio: aspectRatio ?? undefined,
    backgroundColor: dominantColor ?? undefined,
    ...style,
  }

  if (!trio && !fallbackUrl) {
    return (
      <div
        className={className}
        style={{
          ...baseStyle,
          backgroundColor: dominantColor ?? '#e5e7eb',
        }}
        aria-label={alt}
      />
    )
  }

  if (!trio) {
    return (
      <img
        src={fallbackUrl ?? ''}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        // @ts-expect-error — React accepts lowercase fetchpriority for DOM
        fetchpriority={fetchPriority}
        decoding="async"
        className={className}
        style={baseStyle}
      />
    )
  }

  return (
    <picture>
      <source srcSet={trio.avif} type="image/avif" />
      <source srcSet={trio.webp} type="image/webp" />
      <img
        src={trio.jpeg}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        // @ts-expect-error — React accepts lowercase fetchpriority for DOM
        fetchpriority={fetchPriority}
        decoding="async"
        className={className}
        style={baseStyle}
      />
    </picture>
  )
}
