'use client'
import { MOODS, isMood } from '@/components/story/mood'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
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

// 날짜 그룹에 끼워 넣을 스토리(글 중심 — 사진은 같은 날 그리드에 이미 나온다).
export type TimelineStory = {
  id: string
  publicNo: number
  title: string | null
  body: string
  mood: string | null
  visibility: string
}

// 인스타 스토리처럼 절제된 표현 — 사진은 아래 그리드에 있으니 스토리는 한 줄짜리
// 미니멀 리스트로(이모지 + 제목/본문 한 줄). 3개 이상이면 2개만 보이고 '…더보기'로 펼침.
const STORY_COLLAPSE = 2

export function StoryStrip({ stories }: { stories: TimelineStory[] }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = stories.length > STORY_COLLAPSE
  const visible = collapsible && !expanded ? stories.slice(0, STORY_COLLAPSE) : stories
  return (
    <div className="mb-2.5 overflow-hidden rounded-2xl border border-base-200/70 bg-base-0 divide-y divide-base-100 dark:border-base-800/70 dark:bg-base-900 dark:divide-base-800">
      {visible.map((s) => {
        const mood = isMood(s.mood) ? MOODS[s.mood] : null
        return (
          <Link
            key={s.id}
            href={`/story/${s.publicNo}`}
            className="flex items-center gap-2 px-3.5 py-2.5 transition-colors active:bg-base-100 md:hover:bg-base-50 dark:active:bg-base-800 dark:md:hover:bg-base-800/60"
          >
            <span aria-hidden className="text-[14px] leading-none">
              {mood ? mood.emoji : '📝'}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-base-700 dark:text-base-300">
              {s.title || s.body}
            </span>
            {s.visibility === 'guardians' && (
              <ShieldCheck size={13} className="shrink-0 text-point-500" strokeWidth={2.2} />
            )}
            <ChevronRight size={15} className="shrink-0 text-base-300 dark:text-base-600" />
          </Link>
        )
      })}
      {collapsible && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1 px-3.5 py-2 text-[12.5px] font-medium text-base-500 transition-colors active:bg-base-100 md:hover:bg-base-50 dark:text-base-400 dark:active:bg-base-800"
        >
          스토리 {stories.length - STORY_COLLAPSE}개 더보기
          <ChevronDown size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
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
  /** 이 날짜의 스토리(있으면 사진 그리드 위에 글 카드로). */
  stories?: TimelineStory[]
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
  stories,
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
        {assets.length > 0 && (
          <span className="text-[12px] font-medium tabular-nums text-base-400 shrink-0">
            {assets.length}장
          </span>
        )}
      </header>
      {stories && stories.length > 0 && <StoryStrip stories={stories} />}
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
