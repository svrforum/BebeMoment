'use client'
import { CheckCircle2, Download, Eye, FolderPlus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useRef } from 'react'

type Props = {
  /** Asset id the menu is anchored to. Null = closed. */
  assetId: string | null
  /** Sequential public number — used for the detail page URL. */
  publicNo: number | null
  /** Viewport coords where the menu opens. */
  x: number
  y: number
  /** Whether the asset is already in the selection set. Drives the
   *  "선택에 추가" / "선택에서 제거" label. */
  isSelected: boolean
  /** 앨범에 추가 노출(앨범 권한 + 비숨김). */
  canAlbum: boolean
  /** 삭제 노출(asset.delete.any). */
  canDelete: boolean
  onClose: () => void
  onToggleSelect: () => void
  onAlbum: () => void
  onDelete: () => void
  /** 타임라인 정렬 모드 — 상세 링크에 보존(뷰어 prev/next 정합). */
  sort?: 'taken' | 'uploaded'
}

/**
 * Floating context menu shown on right-click of an asset card. Closes on
 * outside click, scroll, or Esc — the parent owns position state.
 */
export function TimelineContextMenu({
  assetId,
  publicNo,
  x,
  y,
  isSelected,
  canAlbum,
  canDelete,
  onClose,
  onToggleSelect,
  onAlbum,
  onDelete,
  sort = 'taken',
}: Props) {
  const t = useTranslations('timeline')
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
          const q = sort === 'uploaded' ? '?sort=uploaded' : ''
          router.push(`/detail/${publicNo ?? assetId}${q}`)
        }}
      >
        {t('grid.menuDetail')}
      </Item>
      <Item
        icon={<CheckCircle2 size={16} strokeWidth={2.2} />}
        onClick={() => {
          onToggleSelect()
          onClose()
        }}
      >
        {isSelected ? t('grid.menuDeselect') : t('grid.menuSelect')}
      </Item>
      <Item
        icon={<Download size={16} strokeWidth={2.2} />}
        onClick={() => {
          const a = document.createElement('a')
          a.href = `/api/asset/${assetId}/download?q=original`
          a.download = ''
          document.body.appendChild(a)
          a.click()
          a.remove()
          onClose()
        }}
      >
        {t('grid.menuSave')}
      </Item>
      {canAlbum && (
        <Item
          icon={<FolderPlus size={16} strokeWidth={2.2} />}
          onClick={() => {
            onAlbum()
            onClose()
          }}
        >
          {t('grid.menuAddToAlbum')}
        </Item>
      )}
      {canDelete && (
        <>
          <Divider />
          <Item
            icon={<Trash2 size={16} strokeWidth={2.2} />}
            destructive
            onClick={() => {
              onDelete()
              onClose()
            }}
          >
            {t('grid.menuDelete')}
          </Item>
        </>
      )}
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
