import type { Asset, JournalEntry, JournalEntryAsset } from '@bebe/db'
import Link from 'next/link'

type Props = {
  entry: JournalEntry & { assets: (JournalEntryAsset & { asset: Asset })[] }
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
              const d = (t.asset.derivatives ?? {}) as Record<string, string>
              const tk = d.thumb_sm ?? d.poster
              if (!tk) return null
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={t.assetId}
                  src={`/media/${tk}`}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover"
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
