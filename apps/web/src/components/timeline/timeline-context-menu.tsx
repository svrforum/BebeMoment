'use client'
import { saveAsset } from '@/lib/asset-download'
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
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    // role="menu" 는 키보드 모델의 약속이다 — 열리면 첫 항목으로 포커스, 화살표로 이동,
    // Esc·Tab 이면 닫고 사진 카드로 돌아간다. (스크롤하면 닫히므로 포커스가 스크롤을 일으키면 안 된다.)
    items()[0]?.focus({ preventScroll: true })
    const returnFocus = () =>
      document
        .querySelector<HTMLElement>(`[data-asset-id="${assetId}"]`)
        ?.focus({ preventScroll: true })
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        onClose()
        returnFocus()
        return
      }
      const list = items()
      const i = list.indexOf(document.activeElement as HTMLElement)
      const go = (n: number) => {
        e.preventDefault()
        list[(n + list.length) % list.length]?.focus({ preventScroll: true })
      }
      if (e.key === 'ArrowDown') go(i + 1)
      else if (e.key === 'ArrowUp') go(i - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(list.length - 1)
    }
    const onScroll = () => onClose()
    // mousedown so we beat any onClick handlers and close cleanly.
    window.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKey, true)
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
          saveAsset(assetId, 'auto')
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
      tabIndex={-1}
      className={
        destructive
          ? 'flex w-full items-center gap-3 rounded-[19px] px-3 py-2.5 text-left text-[14px] font-medium text-danger-text transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-point-600 dark:focus-visible:outline-point-400'
          : 'flex w-full items-center gap-3 rounded-[19px] px-3 py-2.5 text-left text-[14px] font-medium text-base-800 transition-colors hover:bg-base-100 dark:text-base-100 dark:hover:bg-base-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-point-600 dark:focus-visible:outline-point-400'
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
