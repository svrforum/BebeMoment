import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import { dayCellMarkers } from '@/lib/day-cell-markers'
import type { AssetUrls } from '@bebe/media-client'
import { CalendarCheck2, PencilLine } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

type Asset = { id: string; urls: AssetUrls | null }

type Props = {
  date: Date
  assets: Asset[]
  isCurrentMonth: boolean
  isToday?: boolean
  /** 마지막으로 누른 날. 시트를 닫아도 어느 날을 보고 있었는지 남긴다. */
  isSelected?: boolean
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
  isSelected = false,
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
      aria-pressed={isSelected}
      className={cn(
        'focus-ring group relative flex aspect-square overflow-hidden rounded-2xl',
        'transition-transform ease-ios active:scale-[0.94]',
        !isCurrentMonth && 'opacity-35',
        hasAssets
          ? 'bg-base-100 dark:bg-base-900'
          : // 사진 없는 날엔 남은 일정을 칸 바탕으로도 알린다 — 작은 표식 하나로는 훑어볼 때 놓친다.
            scheduleRemaining > 0
            ? 'bg-point-500/[0.08] dark:bg-point-500/[0.14]'
            : 'bg-transparent',
        // 오늘은 파란 테두리, 고른 날은 진한 테두리 — 둘이 같은 색이면 어느 쪽인지 모른다.
        isSelected
          ? 'ring-[2.5px] ring-base-900 ring-offset-2 ring-offset-base-50 dark:ring-base-50 dark:ring-offset-base-950'
          : isToday &&
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
      <span aria-hidden className="absolute inset-0 z-10 flex flex-col justify-between p-1">
        <span className="flex">
          {/* 사진 있는 날만 가독성 위해 알약 배경. 위치는 모든 칸에서 좌상단으로 같다. */}
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[12px] font-semibold leading-none tabular-nums',
              isSelected
                ? 'bg-base-900 text-white dark:bg-base-50 dark:text-base-900'
                : hasAssets
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
                // 점 하나(7px)는 사진 위에서 거의 안 보였다 — 아이콘이 든 알약으로 늘 같은 모양을 낸다.
                <span
                  key="schedule"
                  className={cn(
                    'flex h-4 items-center gap-[2px] rounded-full px-[3px] text-[10px] font-bold leading-none tabular-nums shadow-sm',
                    marker.active
                      ? 'bg-point-500 text-white'
                      : hasAssets
                        ? 'bg-black/55 text-white/75 backdrop-blur-sm'
                        : 'bg-base-200 text-base-500 dark:bg-base-700 dark:text-base-300',
                  )}
                >
                  <CalendarCheck2 size={10} strokeWidth={2.6} />
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
