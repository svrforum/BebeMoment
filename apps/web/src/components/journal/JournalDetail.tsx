import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
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
                  className="aspect-square w-full rounded-lg object-cover"
                  loading="lazy"
                />
              )
            })}
        </div>
      )}
    </article>
  )
}
