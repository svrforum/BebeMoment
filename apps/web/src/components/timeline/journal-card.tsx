import { MOODS, isMood } from '@/components/journal/mood'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/get'
import type { JournalEntry, JournalEntryAsset } from '@bebe/db-public'
import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'

type Props = {
  entry: JournalEntry & { assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[] }
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function JournalCard({ entry }: Props) {
  const thumbs = entry.assets.slice(0, 3)
  const mood = isMood(entry.mood) ? MOODS[entry.mood] : null
  const d = entry.entryDate
  const day = DAYS[d.getDay()]

  return (
    <Link
      href={`/diary/${entry.id}`}
      className="block transition-transform ease-ios active:scale-[0.985]"
    >
      <article className="group relative overflow-hidden rounded-3xl border border-base-200/70 bg-base-0 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevated dark:border-base-800/70 dark:bg-base-900">
        {/* Subtle mood-tinted accent bar on the left */}
        {mood && (
          <span
            aria-hidden
            className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${mood.tint}`}
          />
        )}
        <div className="flex gap-4 p-5">
          {/* Date column — big day number, small month */}
          <div className="flex w-12 flex-col items-center justify-start pt-0.5">
            <span className="text-[26px] font-bold leading-none tabular-nums tracking-tight text-base-900 dark:text-base-50">
              {d.getDate()}
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-base-400">
              {d.getMonth() + 1}월
            </span>
            <span className="mt-0.5 text-[10px] text-base-400">{day}</span>
          </div>

          {/* Body column */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-base-400">
              <span>일기</span>
              {entry.visibility === 'guardians' && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-point-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-point-500">
                  <ShieldCheck size={10} strokeWidth={2.4} />
                  보호자만
                </span>
              )}
              {mood && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${mood.chip}`}
                >
                  <span aria-hidden className="text-[11px] leading-none">
                    {mood.emoji}
                  </span>
                  <span>{mood.label}</span>
                </span>
              )}
            </div>
            {entry.title && (
              <h3 className="mt-2 truncate text-[17px] font-semibold tracking-tight text-base-900 dark:text-base-50">
                {entry.title}
              </h3>
            )}
            <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-base-600 dark:text-base-300">
              {entry.body}
            </p>
            {thumbs.length > 0 && (
              <div className="mt-4 flex gap-1.5">
                {thumbs.map((t) => {
                  if (!t.asset) return null
                  const trio = pickThumbTrio(t.asset.urls)
                  const fallbackUrl = pickThumbUrl(t.asset.urls)
                  const blurhash = pickBlurhash(t.asset.urls)
                  if (!trio && !fallbackUrl) return null
                  return (
                    <PictureImage
                      key={t.assetId}
                      trio={trio}
                      fallbackUrl={fallbackUrl}
                      alt=""
                      aspectRatio={t.asset.urls?.aspectRatio ?? null}
                      dominantColor={t.asset.urls?.dominantColor ?? null}
                      blurhash={blurhash}
                      className="h-16 w-16 rounded-xl"
                      loading="lazy"
                    />
                  )
                })}
                {entry.assets.length > 3 && (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-base-100 text-[12px] font-medium text-base-500 dark:bg-base-800">
                    +{entry.assets.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
