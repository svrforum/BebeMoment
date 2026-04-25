import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import Link from 'next/link'
import type { CSSProperties } from 'react'

type Props = {
  id: string
  urls: AssetUrls | null
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
}

export function AssetCard({ id, urls, status, kind }: Props) {
  const trio = pickThumbTrio(urls)
  const fallbackUrl = pickThumbUrl(urls)
  const hasImage = trio !== null || fallbackUrl !== null

  return (
    <Link
      href={`/detail/${id}`}
      className={cn(
        'relative block aspect-square overflow-hidden rounded-xl bg-base-100 dark:bg-base-900',
        'transition-transform ease-ios active:scale-[0.97]',
      )}
      style={{ viewTransitionName: `asset-${id}` } as CSSProperties}
    >
      {hasImage ? (
        <PictureImage
          trio={trio}
          fallbackUrl={fallbackUrl}
          alt=""
          aspectRatio={urls?.aspectRatio ?? null}
          dominantColor={urls?.dominantColor ?? null}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-base-500">
          {status === 'processing' ? '처리 중…' : status}
        </div>
      )}
      {kind === 'video' && (
        <div className="absolute top-2 right-2 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-semibold">
          VIDEO
        </div>
      )}
    </Link>
  )
}
