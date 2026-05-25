import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickThumbTrio, pickThumbUrl } from '@/lib/asset-url'
import { cn } from '@/lib/cn'
import type { AssetUrls } from '@bebe/media-client'
import { FolderOpen, Image as ImgIcon } from 'lucide-react'
import Link from 'next/link'

type Props = {
  id: string
  name: string
  childCount: number
  assetCount: number
  /** Optional preview thumbs — up to 4 — used as a 2×2 collage when no cover. */
  preview?: { id: string; urls: AssetUrls | null }[]
  className?: string
}

export function AlbumCard({ id, name, childCount, assetCount, preview = [], className }: Props) {
  const hasPreview = preview.length > 0
  return (
    <Link
      href={`/albums/${id}`}
      className={cn('group block transition-transform ease-ios active:scale-[0.985]', className)}
    >
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-base-100 dark:bg-base-900">
        {hasPreview ? (
          <CollagePreview items={preview} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FolderOpen className="h-10 w-10 text-base-300 dark:text-base-700" strokeWidth={1.4} />
          </div>
        )}
      </div>
      <div className="mt-2 px-1">
        <div className="truncate text-[14px] font-semibold tracking-tight text-base-900 dark:text-base-50">
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] tabular-nums text-base-400">
          <span className="inline-flex items-center gap-1">
            <ImgIcon size={11} strokeWidth={2} />
            {assetCount}
          </span>
          {childCount > 0 && (
            <>
              <span aria-hidden className="h-0.5 w-0.5 rounded-full bg-base-300" />
              <span className="inline-flex items-center gap-1">
                <FolderOpen size={11} strokeWidth={2} />
                {childCount}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

function CollagePreview({
  items,
}: {
  items: { id: string; urls: AssetUrls | null }[]
}) {
  const cells = items.slice(0, 4)
  // 1 → fill; 2 → top + bottom; 3 → 1 large left + 2 right; 4 → 2x2.
  if (cells.length === 1) {
    return <CellImage urls={cells[0]?.urls ?? null} />
  }
  if (cells.length === 2) {
    return (
      <div className="grid h-full grid-rows-2 gap-0.5">
        {cells.map((c) => (
          <CellImage key={c.id} urls={c.urls} />
        ))}
      </div>
    )
  }
  if (cells.length === 3) {
    return (
      <div className="grid h-full grid-cols-2 gap-0.5">
        <CellImage urls={cells[0]?.urls ?? null} />
        <div className="grid grid-rows-2 gap-0.5">
          <CellImage urls={cells[1]?.urls ?? null} />
          <CellImage urls={cells[2]?.urls ?? null} />
        </div>
      </div>
    )
  }
  return (
    <div className="grid h-full grid-cols-2 grid-rows-2 gap-0.5">
      {cells.map((c) => (
        <CellImage key={c.id} urls={c.urls} />
      ))}
    </div>
  )
}

function CellImage({ urls }: { urls: AssetUrls | null }) {
  const trio = pickThumbTrio(urls)
  const fallback = pickThumbUrl(urls)
  if (!trio && !fallback) {
    return <div className="h-full w-full bg-base-200 dark:bg-base-800" />
  }
  return (
    <PictureImage
      trio={trio}
      fallbackUrl={fallback}
      alt=""
      dominantColor={urls?.dominantColor ?? null}
      blurhash={pickBlurhash(urls)}
      className="h-full w-full"
      loading="lazy"
    />
  )
}
