import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import { dayCellMarkers } from '@/lib/day-cell-markers'
import type { AssetUrls } from '@bebe/media-client'
import { PencilLine } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

type Asset = { id: string; urls: AssetUrls | null }

type Props = {
  date: Date
  assets: Asset[]
  isCurrentMonth: boolean
  isToday?: boolean
  /** 그 날 사진 중 스토리에 속한 게 있으면 스토리 표식(모델 B). */
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
  const markers = dayCellMarkers({ hasStory, scheduleTotal, scheduleRemaining })

  // 표식은 전부 장식이다 — 그날에 무엇이 있는지는 칸 버튼의 이름이 말한다.
  const labelParts = [
    date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
  ]
  if (hasAssets) labelParts.push(t('calendar.photoCount', { count: assets.length }))
  if (hasStory) labelParts.push(t('calendar.hasStory'))
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
      {/* 날짜 줄과 표식 줄은 겹치지 않는 두 줄이다 — 한 줄에 두면 좁은 칸에서 두 자리
          날짜가 표식에 가려 잘린다(`dayCellMarkers` 주석). */}
      <span aria-hidden className="relative z-10 flex h-full w-full flex-col justify-between p-1">
        <span className="flex">
          {/* 사진 있는 날만 가독성 위해 알약 배경. 위치는 모든 칸에서 좌상단으로 같다. */}
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[12px] font-semibold leading-none tabular-nums',
              hasAssets
                ? 'bg-black/55 text-white backdrop-blur-sm'
                : isToday
                  ? 'text-point-500'
                  : isCurrentMonth
                    ? 'text-base-700 dark:text-base-300'
                    : 'text-base-400 dark:text-base-600',
            )}
          >
            {dayNum}
          </span>
        </span>
        {markers.length > 0 && (
          <span className="flex items-center justify-end gap-0.5">
            {markers.map((marker) =>
              marker.kind === 'story' ? (
                <span
                  key="story"
                  className={cn(
                    'flex h-[14px] w-[14px] items-center justify-center rounded-full',
                    hasAssets
                      ? 'bg-black/55 text-white backdrop-blur-sm'
                      : 'bg-point-500/15 text-point-500',
                  )}
                >
                  <PencilLine size={9} strokeWidth={2.8} />
                </span>
              ) : (
                <span
                  key="schedule"
                  className={cn(
                    'flex items-center justify-center rounded-full text-[10px] font-bold leading-none tabular-nums',
                    marker.showCount ? 'h-[14px] min-w-[14px] px-[3px]' : 'h-[7px] w-[7px]',
                    marker.active
                      ? 'bg-point-500 text-white'
                      : hasAssets
                        ? 'bg-black/55 text-white/70 backdrop-blur-sm'
                        : 'bg-base-300 text-base-600 dark:bg-base-700 dark:text-base-300',
                  )}
                >
                  {marker.showCount ? marker.count : null}
                </span>
              ),
            )}
          </span>
        )}
      </span>
    </button>
  )
}
