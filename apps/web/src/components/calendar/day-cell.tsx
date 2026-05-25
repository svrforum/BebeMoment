import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import Link from 'next/link'

type Asset = { id: string; urls: AssetUrls | null }

type Props = {
  date: Date
  assets: Asset[]
  isCurrentMonth: boolean
  isToday?: boolean
}

export function DayCell({ date, assets, isCurrentMonth, isToday = false }: Props) {
  const hasAssets = assets.length > 0
  const dayNum = date.getDate()
  const dateParam = date.toISOString().slice(0, 10)
  const firstUrls = assets[0]?.urls ?? null
  const trio = pickThumbTrio(firstUrls)
  const fallbackUrl = pickThumbUrl(firstUrls)
  const blurhash = pickBlurhash(firstUrls)
  const hasThumb = hasAssets && (trio !== null || fallbackUrl !== null)

  return (
    <Link
      href={`/timeline?date=${dateParam}`}
      className={cn(
        'group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl',
        'transition-transform ease-ios active:scale-[0.94]',
        !isCurrentMonth && 'opacity-35',
        hasAssets ? 'bg-base-100 dark:bg-base-900' : 'bg-transparent',
        isToday &&
          'ring-2 ring-point-500 ring-offset-2 ring-offset-base-50 dark:ring-offset-base-950',
      )}
    >
      {hasThumb && (
        <PictureImage
          trio={trio}
          fallbackUrl={fallbackUrl}
          alt=""
          dominantColor={firstUrls?.dominantColor ?? null}
          blurhash={blurhash}
          className="absolute inset-0 h-full w-full"
          loading="lazy"
        />
      )}
      {!hasAssets && (
        <span
          className={cn(
            'text-[15px] font-medium tabular-nums',
            isToday
              ? 'text-point-500'
              : isCurrentMonth
                ? 'text-base-700 dark:text-base-300'
                : 'text-base-400 dark:text-base-600',
          )}
        >
          {dayNum}
        </span>
      )}
      {hasAssets && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {dayNum}
        </span>
      )}
      {assets.length > 1 && (
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
          +{assets.length - 1}
        </span>
      )}
    </Link>
  )
}
