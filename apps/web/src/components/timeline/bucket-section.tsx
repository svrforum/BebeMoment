import type { AssetUrls } from '@bebe/media-client'
import type { CSSProperties } from 'react'
import { AssetCard, type TapModifiers } from './asset-card'

type AssetRow = {
  id: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  urls: AssetUrls | null
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
        {assets.map((a, i) => (
          <div
            key={a.id}
            className="asset-enter"
            style={{ '--enter-delay': `${Math.min(i * 30, 360)}ms` } as CSSProperties}
          >
            <AssetCard
              id={a.id}
              urls={a.urls}
              status={a.status}
              kind={a.kind}
              selectionMode={selectionMode}
              selected={selected?.has(a.id) ?? false}
              {...(onLongPress ? { onLongPress } : {})}
              {...(onTap ? { onTap } : {})}
              {...(onContextMenu ? { onContextMenu } : {})}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
