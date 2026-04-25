import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/get'
import type { JournalEntry, JournalEntryAsset } from '@bebe/db-public'
import Link from 'next/link'

type Props = {
  entry: JournalEntry & { assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[] }
}

export function JournalCard({ entry }: Props) {
  const thumbs = entry.assets.slice(0, 3)
  return (
    <Link href={`/journal/${entry.id}`} className="block">
      <article className="rounded-2xl border border-base-200 bg-base-0 p-4 shadow-sm dark:border-base-800 dark:bg-base-900">
        <div className="text-xs text-base-500">{entry.entryDate.toISOString().slice(0, 10)}</div>
        {entry.title && <h3 className="mt-1 font-medium">{entry.title}</h3>}
        <p className="mt-1 line-clamp-2 text-sm text-base-500">{entry.body}</p>
        {thumbs.length > 0 && (
          <div className="mt-3 flex gap-1">
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
                  className="h-20 w-20 rounded-lg"
                  loading="lazy"
                />
              )
            })}
            {entry.assets.length > 3 && (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-base-100 text-xs text-base-500 dark:bg-base-800">
                +{entry.assets.length - 3}
              </div>
            )}
          </div>
        )}
      </article>
    </Link>
  )
}
