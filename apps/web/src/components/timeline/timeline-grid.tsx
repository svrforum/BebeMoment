'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import type { AssetEvent } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'
import { FolderPlus, ImagePlus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TapModifiers } from './asset-card'
import { BucketSection } from './bucket-section'
import { TimelineContextMenu } from './timeline-context-menu'

type AssetRow = {
  id: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  urls: AssetUrls | null
}

type BucketGroup = { label: string; assets: AssetRow[] }

type Props = {
  initialGroups: BucketGroup[]
}

export function TimelineGrid({ initialGroups }: Props) {
  const router = useRouter()
  const toast = useToast()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const selectionMode = selected.size > 0

  // Flat ordered list of asset ids — used by Shift-click range selection
  // and to clamp range bounds. Stable across re-renders via useMemo.
  const orderedIds = useMemo(
    () => initialGroups.flatMap((g) => g.assets.map((a) => a.id)),
    [initialGroups],
  )

  // SSE fires one event per asset settling. A multi-file upload would call
  // router.refresh() N times in quick succession — each refresh re-fetches
  // the page payload and the AppHeader visibly flickers. Debounce so we
  // only refresh after a short idle window.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])
  const handleEvent = useCallback(
    (event: AssetEvent) => {
      if (
        event.type === 'asset.updated' &&
        (event.status === 'ready' || event.status === 'failed')
      ) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => router.refresh(), 800)
      }
    },
    [router],
  )
  useFamilySSE(handleEvent)

  const onLongPress = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setAnchor(id)
  }, [])

  const onTap = useCallback(
    (id: string, mods: TapModifiers) => {
      // Shift-click extends a contiguous range from the last anchor to the
      // tapped id, in flat-grid order. With no anchor, behaves like a
      // plain modifier-click (just adds the single id).
      if (mods.shift && anchor && anchor !== id) {
        const a = orderedIds.indexOf(anchor)
        const b = orderedIds.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a]
          setSelected((prev) => {
            const next = new Set(prev)
            for (let i = from; i <= to; i++) {
              const k = orderedIds[i]
              if (k) next.add(k)
            }
            return next
          })
          setAnchor(id)
          return
        }
      }
      // Otherwise (ctrl/cmd, or plain tap inside selection mode): toggle.
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setAnchor(id)
    },
    [anchor, orderedIds],
  )

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setAnchor(null)
  }, [])

  const bulkDelete = useCallback(async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    // Per-asset POST in parallel. softDelete is idempotent + cheap so the
    // failures-allowed semantics of allSettled are fine — we surface a
    // single toast summarising any failures.
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/asset/${id}/delete`, { method: 'POST' }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
        }),
      ),
    )
    const failures = results.filter((r) => r.status === 'rejected').length
    if (failures > 0) {
      toast({
        title: '일부 삭제 실패',
        description: `${ids.length - failures}/${ids.length}개 삭제됨. 다시 시도해주세요.`,
        variant: 'danger',
      })
    } else {
      toast({ title: `${ids.length}장 삭제됨`, description: '휴지통에서 복구할 수 있어요' })
    }
    clearSelection()
    router.refresh()
  }, [selected, clearSelection, router, toast])

  // Esc clears the selection — only when a sheet/modal isn't taking
  // priority over the keyboard. Skipping when the picker is open lets the
  // sheet's own Esc handler close it first; the second Esc clears.
  useEffect(() => {
    if (selected.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pickerOpen) return
      clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size, pickerOpen, clearSelection])

  if (initialGroups.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-5 py-16 text-center">
        <div className="rounded-full bg-base-100 p-6 dark:bg-base-800">
          <ImagePlus className="h-10 w-10 text-base-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-base-900 dark:text-base-50">
            아직 올라온 사진이 없어요
          </p>
          <p className="mt-1 text-sm text-base-500">우측 하단 + 버튼을 눌러 첫 사진을 올려보세요</p>
        </div>
      </div>
    )
  }

  // Right-click context menu — operates on a single asset id, regardless
  // of selection. If the asset isn't already selected, the menu's
  // toggle/album/delete actions implicitly use just that one asset.
  const onContextMenu = useCallback((id: string, x: number, y: number) => {
    setMenu({ id, x, y })
  }, [])
  const closeMenu = useCallback(() => setMenu(null), [])

  // The context menu's "삭제" / "앨범" actions need to act on the right
  // target. If the asset was already in the selection set, fall back to
  // the bulk path. Otherwise act on just the right-clicked asset.
  const targetIdsForMenu = useCallback((): string[] => {
    if (!menu) return []
    if (selected.has(menu.id)) return Array.from(selected)
    return [menu.id]
  }, [menu, selected])

  const onMenuAlbum = useCallback(() => {
    const ids = targetIdsForMenu()
    if (ids.length === 0) return
    if (!selected.has(menu?.id ?? '')) {
      // Promote single asset into the selection set so the AlbumPicker
      // shares one source-of-truth.
      setSelected(new Set(ids))
    }
    setPickerOpen(true)
  }, [menu, selected, targetIdsForMenu])

  const onMenuDelete = useCallback(() => {
    const ids = targetIdsForMenu()
    if (ids.length === 0) return
    if (!selected.has(menu?.id ?? '')) setSelected(new Set(ids))
    setDeleteOpen(true)
  }, [menu, selected, targetIdsForMenu])

  return (
    <>
      <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 py-4">
        {initialGroups.map((g, i) => (
          <BucketSection
            key={g.label}
            label={g.label}
            assets={g.assets}
            index={i}
            selectionMode={selectionMode}
            selected={selected}
            onLongPress={onLongPress}
            onTap={onTap}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>

      {selectionMode && (
        <SelectionBar
          count={selected.size}
          onCancel={clearSelection}
          onAlbum={() => setPickerOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
      )}

      <AlbumPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        assetIds={Array.from(selected)}
        onAttached={() => {
          // Keep the picker open for chaining adds (Apple Photos pattern).
          // Only clear once user explicitly closes by tapping outside.
        }}
      />

      <ConfirmSheet
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selected.size}장을 삭제할까요?`}
        description="휴지통으로 옮겨지고, 거기서 30일 안에 복구할 수 있어요."
        onConfirm={bulkDelete}
      />

      <TimelineContextMenu
        assetId={menu?.id ?? null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        isSelected={menu ? selected.has(menu.id) : false}
        onClose={closeMenu}
        onToggleSelect={() => {
          if (menu) onTap(menu.id, { ctrl: true, shift: false })
        }}
        onAlbum={onMenuAlbum}
        onDelete={onMenuDelete}
      />
    </>
  )
}

function SelectionBar({
  count,
  onCancel,
  onAlbum,
  onDelete,
}: {
  count: number
  onCancel: () => void
  onAlbum: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-base-200/70 bg-base-0/95 p-2 shadow-elevated backdrop-blur-xl md:bottom-8 dark:border-base-800/70 dark:bg-base-900/95"
      style={{ marginInline: 'max(env(safe-area-inset-left), 16px)' }}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="선택 해제"
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition hover:bg-base-100 dark:hover:bg-base-800"
      >
        <X size={18} strokeWidth={2} />
      </button>
      <span className="flex-1 px-1 text-[13px] font-medium tabular-nums">{count}장 선택됨</span>
      <button
        type="button"
        onClick={onDelete}
        aria-label="삭제"
        className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        <Trash2 size={18} strokeWidth={2.2} />
      </button>
      <button
        type="button"
        onClick={onAlbum}
        className="inline-flex items-center gap-1.5 rounded-full bg-point-500 px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-95 hover:bg-point-600"
      >
        <FolderPlus size={14} strokeWidth={2.4} />
        앨범에 추가
      </button>
    </div>
  )
}
