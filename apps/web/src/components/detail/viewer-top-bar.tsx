'use client'
import { cn } from '@/lib/cn'
import { MoreVertical, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export function ViewerTopBar({
  assetId,
  visible,
  onDelete,
}: {
  assetId: string
  visible: boolean
  onDelete?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 transition-opacity',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <Link href="/timeline" aria-label="닫기" className="text-white">
        <X className="h-6 w-6" />
      </Link>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="메뉴"
          className="text-white"
        >
          <MoreVertical className="h-6 w-6" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 rounded-xl border bg-base-0 shadow-lg dark:bg-base-900">
            <a
              href={`/api/asset/${assetId}/original`}
              download
              className="block px-4 py-2 text-sm hover:bg-base-100 dark:hover:bg-base-800"
              onClick={() => setMenuOpen(false)}
            >
              원본 다운로드
            </a>
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
                className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-base-100 dark:hover:bg-base-800"
              >
                휴지통으로 이동
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
