import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { MOODS, isMood } from './mood'
import type { StoryCardData } from './story-card-data'

// 모든 화면(타임라인·캘린더 진입·북마크·스토리목록·추억)에서 쓰는 단일 스토리 카드.
// 대표 썸네일 1장(첫 사진) + 제목/본문 한·두 줄. 여러 썸네일은 쓰지 않는다.
// 데이터 매퍼는 story-card-data.ts 에 있다 — 서버 모듈이 카드 하나 때문에 React 를
// 끌고 오지 않게(타임라인 그룹 빌더가 그 매퍼만 쓴다).
export type { StoryCardData } from './story-card-data'
export { storyCardDataFromEntry } from './story-card-data'

export function StoryCard({ data }: { data: StoryCardData }) {
  const t = useTranslations('story')
  const mood = isMood(data.mood) ? MOODS[data.mood] : null
  const trio = pickThumbTrio(data.cover)
  const fallbackUrl = pickThumbUrl(data.cover)
  return (
    <Link
      href={`/story/${data.publicNo}`}
      prefetch={false}
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
            {t('card.label')}
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
              {t(`mood.${data.mood}`)}
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
