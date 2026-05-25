'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/get'
import type { Baby, JournalEntry, JournalEntryAsset } from '@bebe/db-public'
import { NotebookPen, ShieldCheck } from 'lucide-react'
import dynamic from 'next/dynamic'
import { MOODS, isMood } from './mood'

// react-markdown + rehype-sanitize together are ~80KB and only mount when
// a diary detail page opens. Code-split out of the main bundle.
const MarkdownBody = dynamic(() => import('./markdown-body'), { ssr: false })

type Entry = JournalEntry & {
  assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[]
  baby: Baby | null
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function DiaryDetail({ entry }: { entry: Entry }) {
  const mood = isMood(entry.mood) ? MOODS[entry.mood] : null
  const sortedAssets = [...entry.assets].sort((a, b) => a.order - b.order)
  const trimmed = entry.body.trim()
  // "Short" entries (haiku-style one-liners) get a centered quote layout
  // instead of a left-aligned article — they look lonely otherwise.
  const isShort = trimmed.length <= 80 && !trimmed.includes('\n')

  // Mood-less entries get a subtle neutral wash so the hero never looks
  // empty. Same shape as mood tints.
  const heroTint =
    mood?.tint ??
    'from-base-100 via-base-50 to-base-0 dark:from-base-800/60 dark:via-base-800/20 dark:to-transparent'

  const d = entry.entryDate
  const day = DAYS[d.getDay()]

  return (
    <article className="overflow-hidden rounded-3xl border border-base-200/70 bg-base-0 shadow-card dark:border-base-800/70 dark:bg-base-900">
      {/* Hero — soft gradient by mood, big date, mood emoji */}
      <header className={`relative bg-gradient-to-b ${heroTint} px-6 pt-7 pb-6`}>
        <div aria-hidden className="absolute right-5 top-5 leading-none">
          {mood ? (
            <span className="text-[44px] drop-shadow-sm">{mood.emoji}</span>
          ) : (
            <NotebookPen className="h-9 w-9 text-base-400/70 dark:text-base-500/70" strokeWidth={1.6} />
          )}
        </div>
        <div className="flex items-baseline gap-2 text-base-700 dark:text-base-200">
          <span className="text-[44px] font-bold leading-none tabular-nums tracking-tight text-base-900 dark:text-base-50">
            {d.getDate()}
          </span>
          <span className="text-[15px] font-medium text-base-600 dark:text-base-300">
            {d.getMonth() + 1}월 · {day}요일
          </span>
        </div>
        <div className="mt-1 text-[12px] font-medium tabular-nums uppercase tracking-wider text-base-500">
          {d.getFullYear()}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {entry.baby && (
            <span className="inline-flex items-center gap-1 rounded-full bg-base-0/70 px-2.5 py-1 text-[12px] font-medium text-base-800 backdrop-blur-sm dark:bg-base-900/60 dark:text-base-200">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-point-500" />
              {entry.baby.name}
            </span>
          )}
          {entry.visibility === 'guardians' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-point-500/15 px-2 py-1 text-[11px] font-semibold text-point-600 dark:text-point-400">
              <ShieldCheck size={11} strokeWidth={2.4} />
              보호자만
            </span>
          )}
          {mood && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${mood.chip}`}
            >
              {mood.label}
            </span>
          )}
        </div>
      </header>

      {/* Body */}
      <div className={isShort ? 'px-6 py-10 text-center' : 'px-6 py-7'}>
        {entry.title && (
          <h1
            className={
              isShort
                ? 'mb-5 text-[22px] font-semibold tracking-tight text-base-900 dark:text-base-50'
                : 'mb-4 text-[26px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50'
            }
          >
            {entry.title}
          </h1>
        )}
        {isShort ? (
          <p className="text-[20px] font-medium leading-relaxed text-base-800 dark:text-base-100">
            {trimmed}
          </p>
        ) : (
          <div className="prose prose-base max-w-none text-[16px] leading-[1.75] text-base-800 dark:text-base-200">
            <MarkdownBody body={entry.body} />
          </div>
        )}
      </div>

      {/* Asset grid */}
      {sortedAssets.length > 0 && (
        <div className="grid grid-cols-3 gap-1 border-t border-base-100 dark:border-base-800/70">
          {sortedAssets.map((link) => {
            if (!link.asset) return null
            const trio = pickThumbTrio(link.asset.urls)
            const fallbackUrl = pickThumbUrl(link.asset.urls)
            if (!trio && !fallbackUrl) return null
            return (
              <PictureImage
                key={link.assetId}
                trio={trio}
                fallbackUrl={fallbackUrl}
                alt=""
                dominantColor={link.asset.urls?.dominantColor ?? null}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
            )
          })}
        </div>
      )}
    </article>
  )
}
