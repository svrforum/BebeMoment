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
  label: string
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
      <header className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[17px] font-semibold tracking-tight text-base-900 dark:text-base-50">
          {label}
        </h2>
        <span className="text-[12px] font-medium tabular-nums text-base-400">
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
