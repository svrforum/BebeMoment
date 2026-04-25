'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import { useFamilySSE } from '@/lib/sse'
import type { AssetEvent } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'
import { FolderPlus, ImagePlus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { BucketSection } from './bucket-section'

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

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)

  const selectionMode = selected.size > 0

  const handleEvent = useCallback(
    (event: AssetEvent) => {
      if (
        event.type === 'asset.updated' &&
        (event.status === 'ready' || event.status === 'failed')
      ) {
        router.refresh()
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
  }, [])

  const onTapInSelection = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

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

  return (
    <>
      <div className="mx-auto max-w-3xl px-5 py-4">
        {initialGroups.map((g, i) => (
          <BucketSection
            key={g.label}
            label={g.label}
            assets={g.assets}
            index={i}
            selectionMode={selectionMode}
            selected={selected}
            onLongPress={onLongPress}
            onTapInSelection={onTapInSelection}
          />
        ))}
      </div>

      {selectionMode && (
        <SelectionBar
          count={selected.size}
          onCancel={clearSelection}
          onAlbum={() => setPickerOpen(true)}
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
    </>
  )
}

function SelectionBar({
  count,
  onCancel,
  onAlbum,
}: {
  count: number
  onCancel: () => void
  onAlbum: () => void
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
      <span className="flex-1 px-1 text-[13px] font-medium tabular-nums">
        {count}장 선택됨
      </span>
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
