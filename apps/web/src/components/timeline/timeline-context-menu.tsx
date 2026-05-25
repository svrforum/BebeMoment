'use client'
import { CheckCircle2, Eye, FolderPlus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef } from 'react'

type Props = {
  /** Asset id the menu is anchored to. Null = closed. */
  assetId: string | null
  /** Viewport coords where the menu opens. */
  x: number
  y: number
  /** Whether the asset is already in the selection set. Drives the
   *  "선택에 추가" / "선택에서 제거" label. */
  isSelected: boolean
  onClose: () => void
  onToggleSelect: () => void
  onAlbum: () => void
  onDelete: () => void
}

/**
 * Floating context menu shown on right-click of an asset card. Closes on
 * outside click, scroll, or Esc — the parent owns position state.
 */
export function TimelineContextMenu({
  assetId,
  x,
  y,
  isSelected,
  onClose,
  onToggleSelect,
  onAlbum,
  onDelete,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!assetId) return
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = () => onClose()
    // mousedown so we beat any onClick handlers and close cleanly.
    window.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [assetId, onClose])

  if (!assetId) return null

  // Clamp to viewport so the menu doesn't render off-screen for clicks
  // near the right/bottom edges.
  const MENU_W = 200
  const MENU_H = 200
  const left = Math.min(x, window.innerWidth - MENU_W - 8)
  const top = Math.min(y, window.innerHeight - MENU_H - 8)

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: 'fixed', left, top, zIndex: 50 }}
      className="min-w-[200px] overflow-hidden rounded-2xl border border-base-200/70 bg-base-0/98 p-1 shadow-elevated backdrop-blur-xl dark:border-base-800/70 dark:bg-base-900/98"
    >
      <Item
        icon={<Eye size={16} strokeWidth={2.2} />}
        onClick={() => {
          onClose()
          router.push(`/detail/${assetId}`)
        }}
      >
        상세 보기
      </Item>
      <Item
        icon={<CheckCircle2 size={16} strokeWidth={2.2} />}
        onClick={() => {
          onToggleSelect()
          onClose()
        }}
      >
        {isSelected ? '선택에서 제거' : '선택에 추가'}
      </Item>
      <Item
        icon={<FolderPlus size={16} strokeWidth={2.2} />}
        onClick={() => {
          onAlbum()
          onClose()
        }}
      >
        앨범에 추가
      </Item>
      <Divider />
      <Item
        icon={<Trash2 size={16} strokeWidth={2.2} />}
        destructive
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        삭제
      </Item>
    </div>
  )
}

function Item({
  icon,
  children,
  onClick,
  destructive,
}: {
  icon: ReactNode
  children: ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className={
        destructive
          ? 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-base-800 transition-colors hover:bg-base-100 dark:text-base-100 dark:hover:bg-base-800'
      }
    >
      <span className={destructive ? '' : 'text-base-500'}>{icon}</span>
      <span>{children}</span>
    </button>
  )
}

function Divider() {
  return <div className="my-1 h-px bg-base-200/70 dark:bg-base-800/70" />
}
