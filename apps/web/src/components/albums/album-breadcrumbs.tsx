import { ChevronRight, Home } from 'lucide-react'
import Link from 'next/link'

type Props = {
  /** Path from root → ... → current album. The last entry is treated as
   *  the current page (rendered without a link). */
  trail: { id: string; name: string }[]
}

export function AlbumBreadcrumbs({ trail }: Props) {
  return (
    <nav
      aria-label="앨범 경로"
      className="-ml-1 flex items-center gap-1 overflow-x-auto pb-1 text-[13px] text-base-500"
    >
      <Link
        href="/albums"
        className="inline-flex h-7 items-center gap-1 rounded-full px-2 transition-colors hover:bg-base-100 dark:hover:bg-base-800"
      >
        <Home size={14} strokeWidth={2} />
        <span>앨범</span>
      </Link>
      {trail.map((node, i) => {
        const isLast = i === trail.length - 1
        return (
          <span key={node.id} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-base-300" />
            {isLast ? (
              <span className="rounded-full px-2 py-1 font-semibold text-base-900 dark:text-base-50">
                {node.name}
              </span>
            ) : (
              <Link
                href={`/albums/${node.id}`}
                className="rounded-full px-2 py-1 transition-colors hover:bg-base-100 dark:hover:bg-base-800"
              >
                {node.name}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
