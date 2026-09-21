import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import { PencilLine } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

type Asset = { id: string; urls: AssetUrls | null }

type Props = {
  date: Date
  assets: Asset[]
  isCurrentMonth: boolean
  isToday?: boolean
  /** 그 날 사진 중 스토리에 속한 게 있으면 우상단 스토리 뱃지(모델 B). */
  hasStory?: boolean
  /** 그날 일정 수(회차 기준). 0 이면 아무것도 그리지 않는다. */
  scheduleTotal?: number
  /** 그중 아직 완료되지 않은 수. 0 이면 흐린 표시. */
  scheduleRemaining?: number
  /** 칸을 누르면 그날 요약 시트가 열린다. */
  onSelect: () => void
}

/**
 * 칸은 링크가 아니라 버튼이다 — 안에 일정 칩·완료 체크 같은 인터랙티브 요소가 들어가는데
 * `<a>` 안의 버튼은 유효하지 않은 마크업이고 보조기술에서 깨진다.
 */
export function DayCell({
  date,
  assets,
  isCurrentMonth,
  isToday = false,
  hasStory = false,
  scheduleTotal = 0,
  scheduleRemaining = 0,
  onSelect,
}: Props) {
  const t = useTranslations('timeline')
  const locale = useLocale()
  const hasAssets = assets.length > 0
  const dayNum = date.getUTCDate()
  const firstUrls = assets[0]?.urls ?? null
  const trio = pickThumbTrio(firstUrls)
  const fallbackUrl = pickThumbUrl(firstUrls)
  const blurhash = pickBlurhash(firstUrls)
  const hasThumb = hasAssets && (trio !== null || fallbackUrl !== null)

  const labelParts = [
    date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
  ]
  if (hasAssets) labelParts.push(t('calendar.photoCount', { count: assets.length }))
  if (scheduleTotal > 0) labelParts.push(t('calendar.scheduleCount', { count: scheduleTotal }))

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={labelParts.join(', ')}
      className={cn(
        'focus-ring group relative flex aspect-square overflow-hidden rounded-2xl',
        'transition-transform ease-ios active:scale-[0.94]',
        !isCurrentMonth && 'opacity-35',
        hasAssets ? 'bg-base-100 dark:bg-base-900' : 'bg-transparent',
        isToday &&
          'ring-2 ring-point-500 ring-offset-2 ring-offset-base-50 dark:ring-offset-base-950',
      )}
    >
      {hasThumb && (
        <PictureImage
          assetId={assets[0]?.id}
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
          aria-label={t('calendar.hasStory')}
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
      {scheduleTotal > 0 && (
        // 사진 커버(좌상단 날짜·우상단 스토리)와 겹치지 않는 아래쪽 모서리. 개수는
        // aria-label 이 이미 말하므로 도형은 장식으로만 둔다.
        <span
          aria-hidden
          className={cn(
            'absolute bottom-1 right-1.5 z-10 flex items-center justify-center rounded-full text-[10px] font-bold leading-none tabular-nums',
            scheduleTotal > 1 ? 'h-[15px] min-w-[15px] px-1' : 'h-[7px] w-[7px]',
            scheduleRemaining > 0
              ? 'bg-point-500 text-white'
              : hasAssets
                ? 'bg-black/55 text-white/70 backdrop-blur-sm'
                : 'bg-base-300 text-base-600 dark:bg-base-700 dark:text-base-300',
          )}
        >
          {scheduleTotal > 1 ? scheduleTotal : null}
        </span>
      )}
    </button>
  )
}
