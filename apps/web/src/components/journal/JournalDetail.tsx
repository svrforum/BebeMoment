import { pickThumbUrl } from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/get'
import type { JournalEntry, JournalEntryAsset } from '@bebe/db-public'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

export function JournalDetail({
  entry,
}: {
  entry: JournalEntry & { assets: (JournalEntryAsset & { asset: AssetWithUrls | null })[] }
}) {
  return (
    <article className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {entry.entryDate.toISOString().slice(0, 10)}
        {entry.mood ? ` · ${entry.mood}` : ''}
      </div>
      {entry.title && <h1 className="text-xl font-semibold">{entry.title}</h1>}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{entry.body}</ReactMarkdown>
      </div>
      {entry.assets.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {entry.assets
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((link) => {
              if (!link.asset) return null
              const url = pickThumbUrl(link.asset.urls)
              if (!url) return null
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={link.assetId}
                  src={url}
                  alt=""
                  className="aspect-square w-full rounded-lg object-cover"
                />
              )
            })}
        </div>
      )}
    </article>
  )
}
