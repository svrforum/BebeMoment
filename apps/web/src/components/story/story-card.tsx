import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/types'
import type { Story, StoryAsset } from '@bebe/db-public'
import type { AssetUrls } from '@bebe/media-client'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { MOODS, isMood } from './mood'

// 모든 화면(타임라인·캘린더 진입·북마크·스토리목록·추억)에서 쓰는 단일 스토리 카드.
// 대표 썸네일 1장(첫 사진) + 제목/본문 한·두 줄. 여러 썸네일은 쓰지 않는다.
export type StoryCardData = {
  id: string
  publicNo: number
  title: string | null
  body: string
  mood: string | null
  visibility: string
  /** 대표 썸네일 = 스토리의 첫 사진(order 0). 없으면 무드 이모지 폴백. */
  cover: AssetUrls | null
}

type StoryEntryLike = Story & {
  assets: (StoryAsset & { asset: AssetWithUrls | null })[]
}

export function storyCardDataFromEntry(entry: StoryEntryLike): StoryCardData {
  const cover =
    entry.assets
      .slice()
      .sort((a, b) => a.order - b.order)
      .find((ea) => ea.asset)?.asset?.urls ?? null
  return {
    id: entry.id,
    publicNo: entry.publicNo,
    title: entry.title ?? null,
    body: entry.body,
    mood: entry.mood ?? null,
    visibility: entry.visibility,
    cover,
  }
}

export function StoryCard({ data }: { data: StoryCardData }) {
  const mood = isMood(data.mood) ? MOODS[data.mood] : null
  const trio = pickThumbTrio(data.cover)
  const fallbackUrl = pickThumbUrl(data.cover)
  return (
    <Link
      href={`/story/${data.publicNo}`}
      className="group flex items-center gap-3 rounded-2xl border border-base-200/70 bg-base-0 p-2.5 shadow-card transition-all duration-200 active:scale-[0.99] md:hover:-translate-y-0.5 md:hover:shadow-elevated dark:border-base-800/70 dark:bg-base-900"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-base-100 dark:bg-base-800">
        {trio || fallbackUrl ? (
          <PictureImage
            trio={trio}
            fallbackUrl={fallbackUrl}
            alt=""
            aspectRatio={1}
            dominantColor={data.cover?.dominantColor ?? null}
            blurhash={pickBlurhash(data.cover)}
            className="h-full w-full"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[22px]">
            {mood ? mood.emoji : '📝'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-base-400">
            스토리
          </span>
          {data.visibility === 'guardians' && (
            <ShieldCheck size={12} className="shrink-0 text-point-500" strokeWidth={2.4} />
          )}
          {mood && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${mood.chip}`}
            >
              <span aria-hidden className="text-[11px] leading-none">
                {mood.emoji}
              </span>
              {mood.label}
            </span>
          )}
        </div>
        {data.title && (
          <div className="mt-0.5 truncate text-[14px] font-semibold tracking-tight text-base-900 dark:text-base-50">
            {data.title}
          </div>
        )}
        <p
          className={`text-[13px] leading-snug text-base-600 dark:text-base-300 ${
            data.title ? 'mt-0.5 line-clamp-1' : 'mt-0.5 line-clamp-2'
          }`}
        >
          {data.body}
        </p>
      </div>
      <ChevronRight
        size={16}
        className="shrink-0 text-base-300 transition-colors group-hover:text-base-400 dark:text-base-600"
      />
    </Link>
  )
}
