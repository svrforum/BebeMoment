'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/get'
import type { JournalEntry, JournalEntryAsset } from '@bebe/db-public'
import dynamic from 'next/dynamic'

// react-markdown + rehype-sanitize together are ~80KB and only mount when
// a journal detail page opens. Code-split out of the main bundle.
const MarkdownBody = dynamic(() => import('./markdown-body'), { ssr: false })

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
      <MarkdownBody body={entry.body} />
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
