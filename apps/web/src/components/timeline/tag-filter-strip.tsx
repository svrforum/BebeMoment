import { TagChip } from '@/components/tags/tag-chip'
import { listTagsWithCounts } from '@/server/tag/list'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { X } from 'lucide-react'
import Link from 'next/link'

type Props = {
  familyId: string
  prismaPublic: PrismaPublic
  /** Currently active filter slugs (intersected, AND). */
  activeSlugs?: string[]
}

function buildHref(slugs: string[]): string {
  if (slugs.length === 0) return '/timeline'
  const params = new URLSearchParams()
  for (const s of slugs) params.append('tag', s)
  return `/timeline?${params.toString()}`
}

/**
 * Sticky chip strip below AppHeader. Up to 8 family tags by use count.
 * Multiple slugs can be active at once for AND filtering. Tap an active
 * chip removes it; tap an inactive chip adds it.
 */
export async function TagFilterStrip({ familyId, prismaPublic, activeSlugs = [] }: Props) {
  const tags = await listTagsWithCounts(familyId, prismaPublic)
  if (tags.length === 0 && activeSlugs.length === 0) return null

  const sorted = [...tags].sort((a, b) => b.assetCount - a.assetCount || b.createdAt - a.createdAt)
  const visible = sorted.slice(0, 8)
  const active = new Set(activeSlugs)

  return (
    <div className="mx-auto max-w-3xl px-5 pb-2 pt-1">
      <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1 scrollbar-none">
        {activeSlugs.length > 0 && (
          <Link
            href="/timeline"
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-base-100 px-3 text-[12px] font-medium text-base-700 transition-colors hover:bg-base-200 dark:bg-base-800 dark:text-base-200 dark:hover:bg-base-700"
            aria-label="필터 모두 해제"
          >
            <X size={12} strokeWidth={2.4} />
            <span>전체</span>
          </Link>
        )}
        {activeSlugs.map((slug) => {
          const tag = tags.find((t) => t.slug === slug)
          if (!tag) return null
          const without = activeSlugs.filter((s) => s !== slug)
          return (
            <Link
              key={`active-${slug}`}
              href={buildHref(without)}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-point-500 px-3 text-[12px] font-medium text-white"
            >
              <span>{tag.name}</span>
              <X size={11} strokeWidth={2.4} />
            </Link>
          )
        })}
        {visible
          .filter((t) => !active.has(t.slug))
          .map((t) => (
            <div key={t.id} className="shrink-0">
              <TagChip name={t.name} color={t.color} href={buildHref([...activeSlugs, t.slug])} />
            </div>
          ))}
      </div>
    </div>
  )
}
