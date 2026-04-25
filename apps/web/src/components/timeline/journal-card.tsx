import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/get'
import type { JournalEntry, JournalEntryAsset } from '@bebe/db-public'
import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'

type Props = {
  entry: JournalEntry & { assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[] }
}

export function JournalCard({ entry }: Props) {
  const thumbs = entry.assets.slice(0, 3)
  return (
    <Link
      href={`/journal/${entry.id}`}
      className="block transition-transform ease-ios active:scale-[0.985]"
    >
      <article className="rounded-3xl border border-base-200/70 bg-base-0 p-5 shadow-card transition-shadow hover:shadow-elevated dark:border-base-800/70 dark:bg-base-900">
        <div className="flex items-center gap-2 text-[12px] font-medium tabular-nums text-base-400">
          <span>{entry.entryDate.toISOString().slice(0, 10)}</span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-base-300 dark:bg-base-700" />
          <span>일기</span>
          {entry.visibility === 'guardians' && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-point-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-point-500">
              <ShieldCheck size={10} strokeWidth={2.4} />
              보호자만
            </span>
          )}
        </div>
        {entry.title && (
          <h3 className="mt-1.5 text-[17px] font-semibold tracking-tight text-base-900 dark:text-base-50">
            {entry.title}
          </h3>
        )}
        <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-base-500">{entry.body}</p>
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
                  className="h-20 w-20 rounded-xl"
                  loading="lazy"
                />
              )
            })}
            {entry.assets.length > 3 && (
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-base-100 text-[12px] font-medium text-base-500 dark:bg-base-800">
                +{entry.assets.length - 3}
              </div>
            )}
          </div>
        )}
      </article>
    </Link>
  )
}
