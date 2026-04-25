import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import Link from 'next/link'

type Asset = { id: string; urls: AssetUrls | null }

type Props = {
  date: Date
  assets: Asset[]
  isCurrentMonth: boolean
}

export function DayCell({ date, assets, isCurrentMonth }: Props) {
  const hasAssets = assets.length > 0
  const dayNum = date.getDate()
  const dateParam = date.toISOString().slice(0, 10)
  const firstUrls = assets[0]?.urls ?? null
  const trio = pickThumbTrio(firstUrls)
  const fallbackUrl = pickThumbUrl(firstUrls)
  const hasThumb = hasAssets && (trio !== null || fallbackUrl !== null)

  return (
    <Link
      href={`/timeline?date=${dateParam}`}
      className={cn(
        'relative flex aspect-square rounded-lg overflow-hidden',
        'transition-transform ease-ios active:scale-95',
        !isCurrentMonth && 'opacity-40',
        hasAssets ? 'bg-base-100 dark:bg-base-900' : 'bg-transparent',
      )}
    >
      {hasThumb ? (
        <PictureImage
          trio={trio}
          fallbackUrl={fallbackUrl}
          alt=""
          dominantColor={firstUrls?.dominantColor ?? null}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-base-400">
          {dayNum}
        </div>
      )}
      {hasAssets && (
        <span className="absolute top-1 left-1 rounded bg-black/50 px-1 text-[10px] text-white font-medium">
          {dayNum}
        </span>
      )}
      {assets.length > 1 && (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white font-medium">
          +{assets.length - 1}
        </span>
      )}
    </Link>
  )
}
