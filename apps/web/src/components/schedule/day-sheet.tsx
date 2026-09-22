'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { Sheet } from '@/components/ui/sheet'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { ScheduleEntryView } from '@/server/schedule/list'
import type { AssetUrls } from '@bebe/media-client'
import { Check, ChevronRight, ListChecks, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useMinuteOfDay } from './reminder-label'

type Asset = { id: string; urls: AssetUrls | null }

type Props = {
  open: boolean
  onOpenChange: (next: boolean) => void
  /** 그날(UTC 일자) `YYYY-MM-DD`. 시트가 닫히는 동안에도 마지막 날짜를 유지한다. */
  day: string | null
  assets: Asset[]
  entries: ScheduleEntryView[]
  /** 일정 기능이 꺼져 있으면 섹션을 통째로 숨긴다. */
  showEntries?: boolean
  /** 그 날짜가 채워진 작성 시트를 여는 훅. 없으면 '일정 추가' 를 그리지 않는다. */
  onAddEntry?: ((day: string) => void) | undefined
}

const MAX_THUMBS = 6

/** 그날의 일정과 사진을 한 화면에 모은 요약 시트. 날짜 칸을 누르면 열린다. */
export function DaySheet({
  open,
  onOpenChange,
  day,
  assets,
  entries,
  showEntries = true,
  onAddEntry,
}: Props) {
  const t = useTranslations('schedule')
  const minuteOfDay = useMinuteOfDay()
  const tc = useTranslations('timeline')
  const locale = useLocale()

  const title = day
    ? new Date(`${day}T00:00:00.000Z`).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'UTC',
      })
    : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      {day && (
        <div className="space-y-5 pb-2">
          {showEntries && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-base-500 dark:text-base-400">
                {t('daySheet.entries')}
              </h3>
              {entries.length === 0 ? (
                <p className="py-3 text-[14px] text-base-400">{t('daySheet.noEntries')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 rounded-2xl bg-base-50 px-3 py-2.5 dark:bg-base-800/60"
                    >
                      <span className="w-[68px] shrink-0 text-[12px] font-medium tabular-nums text-base-500 dark:text-base-400">
                        {entry.startMinute === null ? t('allDay') : minuteOfDay(entry.startMinute)}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[14px] font-medium text-base-900 dark:text-base-50',
                          entry.doneAt !== null && 'text-base-400 line-through dark:text-base-500',
                        )}
                      >
                        {entry.title}
                      </span>
                      {entry.checklistTotal > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-[12px] tabular-nums text-base-500 dark:text-base-400">
                          <ListChecks size={13} strokeWidth={2.2} aria-hidden />
                          {t('checklistProgress', {
                            done: entry.checklistDone,
                            total: entry.checklistTotal,
                          })}
                        </span>
                      )}
                      {entry.doneAt !== null && (
                        <span
                          aria-label={t('done')}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-point-500/15 text-point-500"
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 사진이 없는 날에도 사진 화면으로 가는 길은 남긴다 — 섹션째 숨기면 이 시트가
              그날 사진으로 가는 유일한 길을 막아 버린다. */}
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-base-500 dark:text-base-400">
              {t('daySheet.photos')}
            </h3>
            {assets.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5">
                {assets.slice(0, MAX_THUMBS).map((asset) => (
                  <div
                    key={asset.id}
                    className="relative aspect-square overflow-hidden rounded-xl bg-base-100 dark:bg-base-800"
                  >
                    <PictureImage
                      assetId={asset.id}
                      trio={pickThumbTrio(asset.urls)}
                      fallbackUrl={pickThumbUrl(asset.urls)}
                      alt=""
                      dominantColor={asset.urls?.dominantColor ?? null}
                      blurhash={pickBlurhash(asset.urls)}
                      className="absolute inset-0 h-full w-full"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-3 text-[14px] text-base-400">{t('daySheet.noPhotos')}</p>
            )}
            <Link
              href={`/timeline?date=${day}`}
              prefetch={false}
              onClick={() => onOpenChange(false)}
              className="focus-ring mt-2 flex items-center justify-between rounded-2xl px-1 py-2.5 text-[14px] font-medium text-base-700 transition active:opacity-70 dark:text-base-200"
            >
              <span>
                {assets.length > 0 ? t('daySheet.viewAllPhotos') : t('daySheet.openTimeline')}
              </span>
              <span className="flex items-center gap-1 text-[13px] text-base-400">
                {assets.length > 0 ? tc('calendar.photoCount', { count: assets.length }) : null}
                <ChevronRight size={16} />
              </span>
            </Link>
          </section>

          {onAddEntry && (
            <button
              type="button"
              onClick={() => onAddEntry(day)}
              className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-2xl bg-point-500 py-3 text-[15px] font-semibold text-white transition active:scale-[0.98]"
            >
              <Plus size={17} strokeWidth={2.6} />
              {t('daySheet.addEntry')}
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}
