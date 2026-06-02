'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import { BulkDownloadButton } from '@/components/detail/bulk-download-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import type { AssetEvent } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'
import { FolderPlus, ImagePlus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoryCardData } from '@/components/story/story-card'
import type { TapModifiers } from './asset-card'
import { BucketSection } from './bucket-section'
import { TimelineContextMenu } from './timeline-context-menu'

type AssetRow = {
  id: string
  publicNo: number
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  urls: AssetUrls | null
  /** ts 는 디바이더(여기까지 봤어요) 경계 계산에 쓰인다 — 없어도 그리드는 동작. */
  ts?: Date
}

type BucketGroup = {
  /** UTC 일자 키 — append 시 같은 날 버킷 병합 기준. */
  dateKey: string
  label: string
  /** Optional age-bucket secondary line (e.g. "생후 47일"). */
  ageLabel?: string | null
  /** Optional D-day chip (e.g. "D+97" / "D-Day"). */
  dDay?: string | null
  assets: AssetRow[]
  /** 이 날짜의 스토리(사진 그리드 위에 글 카드로). */
  stories?: StoryCardData[]
}

// append 시 같은 날(dateKey) 버킷은 병합(자산·스토리 id 중복 제거), 나머지는 이어붙임.
function mergeGroups(prev: BucketGroup[], next: BucketGroup[]): BucketGroup[] {
  if (next.length === 0) return prev
  const out = [...prev]
  const last = out[out.length - 1]
  let start = 0
  if (last && next[0] && last.dateKey === next[0].dateKey) {
    const seen = new Set(last.assets.map((a) => a.id))
    const storySeen = new Set((last.stories ?? []).map((s) => s.id))
    out[out.length - 1] = {
      ...last,
      assets: [...last.assets, ...next[0].assets.filter((a) => !seen.has(a.id))],
      stories: [
        ...(last.stories ?? []),
        ...(next[0].stories ?? []).filter((s) => !storySeen.has(s.id)),
      ],
    }
    start = 1
  }
  return [...out, ...next.slice(start)]
}

type Props = {
  initialGroups: BucketGroup[]
  /** 다음 페이지 커서(null = 더 없음). 무한스크롤. */
  initialNextCursor?: string | null
  /** 날짜 필터(YYYY-MM-DD) — load-more 에 전달해 같은 스코프 유지. */
  date?: string | null
  /** 이전 방문 시각 (membership.lastSeenAt 의 OLD 값). null = 첫 방문 → 디바이더 없음. */
  lastSeenAt?: Date | null
  /** 업로드 권한자만 빈 상태에 + 버튼 안내. 보기 전용은 다른 카피. */
  canUpload?: boolean
  /** 선택 항목 삭제 권한(없으면 멀티셀렉트 바에서 삭제 숨김). */
  canDeleteSelection?: boolean
  /** 앨범에 추가 가능(앨범 권한 + 앨범 메뉴 비숨김). 없으면 '앨범에 추가' 숨김. */
  canAddAlbum?: boolean
  /** 타임라인 정렬 모드 — 상세(뷰어) 링크에 보존(prev/next 이웃 정합). */
  sort?: 'taken' | 'uploaded'
  /** 컬렉션 맥락(예: 'saved') — 상세 링크에 실어 뷰어 스와이프 스코프 유지. */
  viewerCtx?: string | null
}

export function TimelineGrid({
  initialGroups,
  initialNextCursor = null,
  date = null,
  lastSeenAt = null,
  canUpload = true,
  canDeleteSelection = true,
  canAddAlbum = true,
  sort = 'taken',
  viewerCtx = null,
}: Props) {
  const router = useRouter()
  const toast = useToast()

  const [groups, setGroups] = useState<BucketGroup[]>(initialGroups)
  const [cursor, setCursor] = useState<string | null>(initialNextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  const selectionMode = selected.size > 0

  // Flat ordered list of asset ids — used by Shift-click range selection
  // and to clamp range bounds. Stable across re-renders via useMemo.
  const orderedIds = useMemo(() => groups.flatMap((g) => g.assets.map((a) => a.id)), [groups])

  const publicNoById = useMemo(
    () => new Map(groups.flatMap((g) => g.assets.map((a) => [a.id, a.publicNo] as const))),
    [groups],
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
        event.type === 'asset.deleted' ||
        (event.type === 'asset.updated' && (event.status === 'ready' || event.status === 'failed'))
      ) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => router.refresh(), 800)
      }
    },
    [router],
  )
  useFamilySSE(handleEvent)

  // SSR(또는 router.refresh)이 새 initialGroups 를 주면 상태를 재동기화한다 — 새로고침
  // 후 페이지네이션은 1페이지로 리셋(허용 가능, 새 업로드 반영 우선).
  useEffect(() => {
    setGroups(initialGroups)
    setCursor(initialNextCursor)
  }, [initialGroups, initialNextCursor])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const qp = new URLSearchParams({ sort, cursor })
      if (date) qp.set('date', date)
      const res = await fetch(`/api/timeline?${qp.toString()}`)
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { groups: BucketGroup[]; nextCursor: string | null }
      // JSON 직렬화로 Date → 문자열이 되므로 디바이더 계산에 쓰는 ts 를 Date 로 되살린다.
      const revived = data.groups.map((g) => ({
        ...g,
        assets: g.assets.map((a) => ({
          ...a,
          ts: new Date(a.ts as unknown as string),
        })),
      }))
      setGroups((prev) => mergeGroups(prev, revived))
      setCursor(data.nextCursor)
    } catch {
      toast({ title: '더 불러오지 못했어요. 잠시 후 다시 시도해주세요', variant: 'danger' })
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, sort, date, toast])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !cursor) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, loadMore])

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
    // Per-asset POST, but capped to a small concurrency so a large selection
    // (수백 장) doesn't fan out hundreds of simultaneous requests and saturate
    // the connection pool. softDelete is idempotent so allSettled is fine.
    const CONCURRENCY = 6
    const results: PromiseSettledResult<void>[] = []
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const batch = ids.slice(i, i + CONCURRENCY)
      const settled = await Promise.allSettled(
        batch.map((id) =>
          fetch(`/api/asset/${id}/delete`, { method: 'POST' }).then(async (r) => {
            if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`)
          }),
        ),
      )
      results.push(...settled)
    }
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

  // 빈 상태 early-return 은 반드시 모든 훅 호출 뒤에 둔다. 위쪽에 두면 사진이
  // 0→1 로 바뀌는 순간(신규 가족 첫 업로드) 훅 개수가 달라져 React #310 크래시.
  if (groups.length === 0) {
    if (!canUpload) {
      return (
        <EmptyState
          icon={ImagePlus}
          title="아직 올라온 사진이 없어요"
          description="곧 새로운 사진이 올라올 거예요"
        />
      )
    }
    return (
      <EmptyState
        icon={ImagePlus}
        title="아직 올라온 사진이 없어요"
        description="우측 하단 + 버튼을 눌러 첫 사진을 올려보세요"
      />
    )
  }

  // "여기까지 봤어요" 디바이더 위치 계산 — 그룹들은 ts desc 로 정렬돼 있고,
  // 같은 그룹 안의 자산도 ts desc. 즉 "최신 → 오래된" 순. lastSeenAt 이하인
  // 최초 그룹 인덱스를 찾아 그 앞에 디바이더를 끼운다.
  //   - lastSeenAt === null → 첫 방문, 디바이더 없음
  //   - 모든 그룹이 새로움 (boundary === -1) → 디바이더 없음
  //   - boundary === 0 → 모든 그룹이 봤음, 디바이더 없음(새 게 없음)
  const lastSeenMs = lastSeenAt ? lastSeenAt.getTime() : null
  const boundaryIndex =
    lastSeenMs === null
      ? -1
      : groups.findIndex((g) => g.assets.some((a) => (a.ts ? a.ts.getTime() <= lastSeenMs : false)))
  const showDivider = boundaryIndex > 0

  return (
    <>
      <div className="mx-auto max-w-3xl lg:max-w-5xl xl:max-w-6xl px-5 py-4">
        {groups.map((g, i) => (
          <div key={g.dateKey}>
            {showDivider && i === boundaryIndex && (
              <div className="my-6 flex items-center gap-3 px-1">
                <span className="h-px flex-1 bg-base-200 dark:bg-base-800" />
                <span className="text-[12px] font-medium text-base-400">여기까지 봤어요</span>
                <span className="h-px flex-1 bg-base-200 dark:bg-base-800" />
              </div>
            )}
            {/* viewerCtx 도 함께 — saved 등 컬렉션에서 스와이프 스코프 유지 */}
            <BucketSection
              label={g.label}
              ageLabel={g.ageLabel ?? null}
              dDay={g.dDay ?? null}
              assets={g.assets}
              stories={g.stories ?? []}
              index={i}
              selectionMode={selectionMode}
              selected={selected}
              onLongPress={onLongPress}
              onTap={onTap}
              onContextMenu={onContextMenu}
              sort={sort}
              viewerCtx={viewerCtx}
            />
          </div>
        ))}
        {/* 무한스크롤 센티넬 — 화면 근처(600px)에 들어오면 다음 페이지 로드. */}
        {cursor && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            {loadingMore && (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-base-300 border-t-point-500" />
            )}
          </div>
        )}
      </div>

      {selectionMode && (
        <SelectionBar
          count={selected.size}
          selectedIds={Array.from(selected)}
          canDelete={canDeleteSelection}
          canAlbum={canAddAlbum}
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
          // 추가 후 선택 모드 종료(피커는 스스로 닫힘). 사용자 요청: 추가하면 UI 사라지게.
          clearSelection()
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
        publicNo={menu ? (publicNoById.get(menu.id) ?? null) : null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        isSelected={menu ? selected.has(menu.id) : false}
        canAlbum={canAddAlbum}
        canDelete={canDeleteSelection}
        onClose={closeMenu}
        onToggleSelect={() => {
          if (menu) onTap(menu.id, { ctrl: true, shift: false })
        }}
        onAlbum={onMenuAlbum}
        onDelete={onMenuDelete}
        sort={sort}
      />
    </>
  )
}

function SelectionBar({
  count,
  selectedIds,
  canDelete,
  canAlbum,
  onCancel,
  onAlbum,
  onDelete,
}: {
  count: number
  selectedIds: string[]
  canDelete: boolean
  canAlbum: boolean
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
      <BulkDownloadButton
        assetIds={selectedIds}
        label="저장"
        className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-base-600 transition hover:bg-base-100 disabled:opacity-60 dark:text-base-300 dark:hover:bg-base-800"
      />
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="삭제"
          className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Trash2 size={18} strokeWidth={2.2} />
        </button>
      )}
      {canAlbum && (
        <button
          type="button"
          onClick={onAlbum}
          className="inline-flex items-center gap-1.5 rounded-full bg-point-500 px-3.5 py-2 text-[13px] font-semibold text-white transition active:scale-95 hover:bg-point-600"
        >
          <FolderPlus size={14} strokeWidth={2.4} />
          앨범에 추가
        </button>
      )}
    </div>
  )
}
