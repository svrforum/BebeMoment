'use client'
import { MOODS, isMood } from '@/components/story/mood'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { useToast } from '@/lib/toast'
import type { AssetWithUrls } from '@/server/asset/types'
import type { Story, StoryAsset } from '@bebe/db-public'
import { NotebookPen, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Entry = Story & { assets: (StoryAsset & { asset: AssetWithUrls | null })[] }

/**
 * Compact album story row — small thumb + date + one-line snippet + remove.
 * Stacking full DiaryCards got unreadable once an album had several stories.
 */
export function AlbumStoryItem({ albumId, entry }: { albumId: string; entry: Entry }) {
  const t = useTranslations('album')
  const router = useRouter()
  const toast = useToast()
  const [removing, setRemoving] = useState(false)

  const days = t.raw('story.days') as string[]
  const cover = entry.assets.find((a) => a.asset?.urls)?.asset ?? null
  const trio = cover ? pickThumbTrio(cover.urls) : null
  const fallback = cover ? pickThumbUrl(cover.urls) : null
  const mood = isMood(entry.mood) ? MOODS[entry.mood] : null
  const d = entry.entryDate
  const dateLabel = t('story.date', {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: days[d.getUTCDay()] ?? '',
  })
  const snippet = entry.body.trim() || (entry.title ?? '')
  const photoCount = entry.assets.length

  async function remove(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (removing) return
    setRemoving(true)
    try {
      const res = await fetch(`/api/albums/${albumId}/entries/${entry.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      toast({ title: t('story.removeFailed'), variant: 'danger' })
      setRemoving(false)
    }
  }

  return (
    <div className="group relative flex items-center gap-3 rounded-2xl border border-base-200/70 bg-base-0 px-3 py-2.5 shadow-card dark:border-base-800/70 dark:bg-base-900">
      <Link href={`/story/${entry.publicNo}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-base-100 dark:bg-base-800">
          {trio || fallback ? (
            <PictureImage
              trio={trio}
              fallbackUrl={fallback}
              alt=""
              blurhash={cover ? pickBlurhash(cover.urls) : null}
              className="h-full w-full"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base-400">
              <NotebookPen size={16} strokeWidth={1.9} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-base-400">
            <span>{dateLabel}</span>
            {mood && <span>{mood.emoji}</span>}
            {photoCount > 0 && (
              <span className="tabular-nums">{t('story.photoCount', { count: photoCount })}</span>
            )}
          </div>
          <div className="truncate text-[14px] text-base-900 dark:text-base-50">
            {snippet || t('story.noContent')}
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={removing}
        aria-label={t('story.remove')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base-400 transition hover:bg-base-100 hover:text-base-700 active:scale-90 disabled:opacity-50 dark:hover:bg-base-800 dark:hover:text-base-200"
      >
        <X size={16} strokeWidth={2.2} />
      </button>
    </div>
  )
}
