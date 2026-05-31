import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import { PencilLine } from 'lucide-react'
import Link from 'next/link'

type Asset = { id: string; urls: AssetUrls | null }

type Props = {
  date: Date
  assets: Asset[]
  isCurrentMonth: boolean
  isToday?: boolean
  /** 그 날 사진 중 스토리에 속한 게 있으면 우상단 스토리 뱃지(모델 B). */
  hasStory?: boolean
}

export function DayCell({
  date,
  assets,
  isCurrentMonth,
  isToday = false,
  hasStory = false,
}: Props) {
  const hasAssets = assets.length > 0
  const dayNum = date.getUTCDate()
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
        'group relative flex aspect-square overflow-hidden rounded-2xl',
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
      {/* 날짜는 모든 칸에서 좌상단 동일 위치. 사진 있는 날만 가독성 위해 알약 배경. */}
      <span
        className={cn(
          'absolute left-1.5 top-1.5 z-10 text-[12px] font-semibold tabular-nums',
          hasAssets
            ? 'rounded-md bg-black/55 px-1.5 py-0.5 text-white backdrop-blur-sm'
            : isToday
              ? 'text-point-500'
              : isCurrentMonth
                ? 'text-base-700 dark:text-base-300'
                : 'text-base-400 dark:text-base-600',
        )}
      >
        {dayNum}
      </span>
      {hasStory && (
        <span
          aria-label="스토리 있음"
          className={cn(
            'absolute right-1.5 top-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full',
            hasAssets
              ? 'bg-black/55 text-white backdrop-blur-sm'
              : 'bg-point-500/15 text-point-500',
          )}
        >
          <PencilLine size={10} strokeWidth={2.6} />
        </span>
      )}
    </Link>
  )
}
