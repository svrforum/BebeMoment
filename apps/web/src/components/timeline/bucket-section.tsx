'use client'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronDown } from 'lucide-react'
import { type CSSProperties, useState } from 'react'
import { AssetCard, type TapModifiers } from './asset-card'

// 접힘 기본 노출 수 — 모바일 3열 기준 2줄. 이보다 많으면 '+더보기'로 펼친다.
const COLLAPSED_COUNT = 6

type AssetRow = {
  id: string
  publicNo: number
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  urls: AssetUrls | null
  durationMs?: number | null
}

type Props = {
  /** Primary header line — e.g. "2026.05.27". Falls back to the legacy
   *  age-bucket label when provided alone (back-compat). */
  label: string
  /** Optional age-bucket secondary line — "생후 47일" / "1주년 (돌)" / "D-Day"
   *  계열. 표시되면 date + D-day 행 아래 muted 텍스트로 깔린다. */
  ageLabel?: string | null
  /** Optional D-day chip — "D+97" / "D-30" / "D-Day". 1번째 행 옆에 tabular
   *  numerals 로 살짝 작게. baby 가 없으면 undefined. */
  dDay?: string | null
  assets: AssetRow[]
  index?: number
  selectionMode?: boolean
  selected?: Set<string>
  onLongPress?: (id: string) => void
  onTap?: (id: string, mods: TapModifiers) => void
  onContextMenu?: (id: string, x: number, y: number) => void
}

export function BucketSection({
  label,
  ageLabel = null,
  dDay = null,
  assets,
  index = 0,
  selectionMode = false,
  selected,
  onLongPress,
  onTap,
  onContextMenu,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  // 선택 모드에선 전부 보여야 일괄 선택이 가능 — 접지 않는다.
  const collapsible = !selectionMode && assets.length > COLLAPSED_COUNT
  const visibleAssets = collapsible && !expanded ? assets.slice(0, COLLAPSED_COUNT) : assets
  const hiddenCount = assets.length - COLLAPSED_COUNT

  return (
    <section
      className="section-enter mb-10"
      style={{ '--enter-delay': `${Math.min(index * 60, 240)}ms` } as CSSProperties}
    >
      <header className="mb-3 flex items-end justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline gap-2.5">
            {/* Date — Toss/Apple style: tabular numerals, generous tracking,
                bold but not heavy. */}
            <h2 className="text-[22px] font-bold tracking-tight tabular-nums leading-none text-base-900 dark:text-base-50">
              {label}
            </h2>
            {dDay && (
              <span className="text-[13px] font-semibold tabular-nums leading-none text-base-400">
                {dDay}
              </span>
            )}
          </div>
          {ageLabel && (
            <span className="text-[12px] font-medium text-base-400 dark:text-base-500">
              {ageLabel}
            </span>
          )}
        </div>
        <span className="text-[12px] font-medium tabular-nums text-base-400 shrink-0">
          {assets.length}장
        </span>
      </header>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6">
        {visibleAssets.map((a, i) => (
          <div
            key={a.id}
            className="asset-enter"
            style={{ '--enter-delay': `${Math.min(i * 30, 360)}ms` } as CSSProperties}
          >
            <AssetCard
              id={a.id}
              publicNo={a.publicNo}
              urls={a.urls}
              status={a.status}
              kind={a.kind}
              durationMs={a.durationMs ?? null}
              selectionMode={selectionMode}
              selected={selected?.has(a.id) ?? false}
              {...(onLongPress ? { onLongPress } : {})}
              {...(onTap ? { onTap } : {})}
              {...(onContextMenu ? { onContextMenu } : {})}
            />
          </div>
        ))}
      </div>
      {collapsible && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-base-100 py-2.5 text-[13px] font-medium text-base-600 transition hover:bg-base-200 dark:bg-base-800 dark:text-base-300 dark:hover:bg-base-700"
        >
          사진 {hiddenCount}장 더보기
          <ChevronDown size={16} strokeWidth={2} />
        </button>
      )}
    </section>
  )
}
