'use client'
import { cn } from '@/lib/cn'
import { MoreVertical, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ViewerTopBar({
  assetId,
  visible,
  onDelete,
  onInfo,
  compressEnabled = false,
}: {
  assetId: string
  visible: boolean
  onDelete?: () => void
  /** ⋮ "정보" — 세부정보(메타·태그) 시트를 펼친 채로 연다. 모바일 전용(데스크탑은 사이드 패널). */
  onInfo?: () => void
  /** 관리자 설정: 압축 다운로드(HD/SD) 옵션을 메뉴에 노출할지. */
  compressEnabled?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()

  function close() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/timeline')
    }
  }

  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 transition-opacity',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
    >
      <button type="button" onClick={close} aria-label="닫기" className="text-white">
        <X className="h-6 w-6" />
      </button>
      <div className="flex items-center gap-1">
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
            <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-xl border border-base-200 bg-base-0 shadow-lg dark:border-base-800 dark:bg-base-900">
              {onInfo && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onInfo()
                  }}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-base-100 md:hidden dark:hover:bg-base-800"
                >
                  정보
                </button>
              )}
              <a
                href={`/api/asset/${assetId}/download?q=original`}
                download
                className="block px-4 py-2 text-sm hover:bg-base-100 dark:hover:bg-base-800"
                onClick={() => setMenuOpen(false)}
              >
                원본 다운로드
              </a>
              {compressEnabled && (
                <a
                  href={`/api/asset/${assetId}/download?q=hd`}
                  download
                  className="block px-4 py-2 text-sm hover:bg-base-100 dark:hover:bg-base-800"
                  onClick={() => setMenuOpen(false)}
                >
                  고화질 (1080p)
                </a>
              )}
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
    </div>
  )
}
