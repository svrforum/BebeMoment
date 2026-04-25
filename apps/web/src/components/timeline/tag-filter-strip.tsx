import { TagChip } from '@/components/tags/tag-chip'
import { listTagsWithCounts } from '@/server/tag/list'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import Link from 'next/link'
import { X } from 'lucide-react'

type Props = {
  familyId: string
  prismaPublic: PrismaPublic
  activeSlug?: string
}

/**
 * Sticky chip strip below AppHeader. Shows up to 8 most-recent tags by
 * use-count; tapping filters the timeline. When a filter is active, the
 * cleared chip ("전체") sits at the front to escape.
 */
export async function TagFilterStrip({ familyId, prismaPublic, activeSlug }: Props) {
  const tags = await listTagsWithCounts(familyId, prismaPublic)
  if (tags.length === 0 && !activeSlug) return null

  // Sort by assetCount desc, then most-recent. Cap at 8 for the strip.
  const sorted = [...tags].sort(
    (a, b) =>
      b.assetCount - a.assetCount || b.createdAt.getTime() - a.createdAt.getTime(),
  )
  const visible = sorted.slice(0, 8)

  return (
    <div className="mx-auto max-w-3xl px-5 pb-2 pt-1">
      <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1 scrollbar-none">
        {activeSlug && (
          <Link
            href="/timeline"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-base-100 px-3 text-[12px] font-medium text-base-700 transition-colors hover:bg-base-200 dark:bg-base-800 dark:text-base-200 dark:hover:bg-base-700"
          >
            <X size={12} strokeWidth={2.4} />
            <span>{activeSlug}</span>
          </Link>
        )}
        {visible
          .filter((t) => t.slug !== activeSlug)
          .map((t) => (
            <div key={t.id} className="shrink-0">
              <TagChip
                name={t.name}
                color={t.color}
                href={`/timeline?tag=${encodeURIComponent(t.slug)}`}
              />
            </div>
          ))}
      </div>
    </div>
  )
}
