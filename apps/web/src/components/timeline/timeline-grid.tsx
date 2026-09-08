'use client'
import { AlbumPicker } from '@/components/albums/album-picker'
import { BulkDownloadButton } from '@/components/detail/bulk-download-button'
import { SelectionShareButton } from '@/components/detail/selection-share-button'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import type { AssetEvent } from '@bebe/core'
import { ArrowUp, FolderPlus, ImagePlus, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TapModifiers } from './asset-card'
import { BucketSection } from './bucket-section'
import { type BucketGroup, estimateSectionHeight, mergeGroups, reconcileHead } from './groups'
import {
  AT_TOP_SCROLL_PX,
  NO_PENDING,
  type PendingChanges,
  hasPending,
  pendingLabelCount,
  receiveEvent,
} from './live-refresh'
import { TimelineContextMenu } from './timeline-context-menu'

// useLayoutEffect 는 SSR 에서 경고를 낸다. 스크롤 보정은 브라우저에서만 의미가 있다.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

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
  const t = useTranslations('timeline')
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
  const [pending, setPending] = useState<PendingChanges>(NO_PENDING)
  /** 화면에 안 그려지므로 ref — 몇 페이지까지 불러왔는지(1 = 첫 페이지만). */
  const pagesLoadedRef = useRef(1)

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
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 800)
  }, [router])

  // pending 은 화면에 그려지므로 state, 그 최신값은 SSE 콜백이 같은 틱에 연달아 읽으므로 ref.
  const pendingRef = useRef<PendingChanges>(NO_PENDING)
  const updatePending = useCallback((next: PendingChanges) => {
    pendingRef.current = next
    setPending(next)
  }, [])

  const handleEvent = useCallback(
    (event: AssetEvent) => {
      const decision = receiveEvent(pendingRef.current, event, {
        scrollY: window.scrollY,
        pagesLoaded: pagesLoadedRef.current,
      })
      if (decision.pending !== pendingRef.current) updatePending(decision.pending)
      if (decision.refreshNow) scheduleRefresh()
    },
    [scheduleRefresh, updatePending],
  )
  useFamilySSE(handleEvent)

  const groupsRef = useRef(groups)
  useEffect(() => {
    groupsRef.current = groups
  }, [groups])
  const appliedRef = useRef(initialGroups)
  const anchorRef = useRef<{ scrollY: number; height: number } | null>(null)
  // 정렬·날짜가 바뀌면 목록이 다른 순서의 다른 목록이다 — 이어붙이지 말고 통째로 교체.
  // (?sort= 토글은 같은 컴포넌트 인스턴스를 유지한 채 새 initialGroups 만 준다.)
  const scopeKey = `${sort}|${date ?? ''}`
  const scopeRef = useRef(scopeKey)

  // SSR(또는 router.refresh)이 새 initialGroups 를 주면 **머리만** 갈아끼우고 사용자가
  // 추가로 불러온 페이지는 남긴다. 예전엔 통째로 1페이지로 되돌려서, 남이 사진 한 장을
  // 올리는 순간 작년 봄까지 스크롤한 사람이 맨 앞으로 튕겼다.
  useEffect(() => {
    const scopeChanged = scopeRef.current !== scopeKey
    if (appliedRef.current === initialGroups && !scopeChanged) return
    appliedRef.current = initialGroups
    scopeRef.current = scopeKey
    // 맨 위가 아니면 갱신 전후 문서 높이 차이만큼 스크롤을 되밀어 보던 사진을 붙잡는다.
    if (!scopeChanged && window.scrollY >= AT_TOP_SCROLL_PX) {
      anchorRef.current = {
        scrollY: window.scrollY,
        height: document.documentElement.scrollHeight,
      }
    }
    const reconciled = scopeChanged
      ? { groups: initialGroups, keptPages: false }
      : reconcileHead(groupsRef.current, initialGroups)
    groupsRef.current = reconciled.groups
    setGroups(reconciled.groups)
    if (!reconciled.keptPages) {
      setCursor(initialNextCursor)
      pagesLoadedRef.current = 1
    }
    updatePending(NO_PENDING)
  }, [initialGroups, initialNextCursor, scopeKey, updatePending])

  useBrowserLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    anchorRef.current = null
    const delta = document.documentElement.scrollHeight - anchor.height
    if (delta !== 0) window.scrollTo(0, Math.max(0, anchor.scrollY + delta))
  }, [groups])

  const applyPending = useCallback(() => {
    updatePending(NO_PENDING)
    router.refresh()
  }, [router, updatePending])

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
      pagesLoadedRef.current += 1
    } catch {
      toast({ title: t('grid.loadMoreFailed'), variant: 'danger' })
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, sort, date, toast, t])

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
        title: t('grid.deletePartialFailed'),
        description: t('grid.deletePartialDesc', {
          done: ids.length - failures,
          total: ids.length,
        }),
        variant: 'danger',
      })
    } else {
      toast({
        title: t('grid.deletedCount', { count: ids.length }),
        description: t('grid.deletedDesc'),
      })
    }
    clearSelection()
    router.refresh()
  }, [selected, clearSelection, router, toast, t])

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
          title={t('grid.emptyTitle')}
          description={t('grid.emptyViewerDesc')}
        />
      )
    }
    return (
      <EmptyState
        icon={ImagePlus}
        title={t('grid.emptyTitle')}
        description={t('grid.emptyUploaderDesc')}
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
      {/* overflow-anchor 를 끄는 이유: 갱신 후 스크롤 보정을 우리가 직접 한다(위 layout
          effect). 브라우저의 자동 앵커링까지 겹치면 두 번 밀려 오히려 튄다. */}
      <div
        className="mx-auto max-w-3xl lg:max-w-5xl xl:max-w-6xl px-5 py-4"
        style={{ overflowAnchor: 'none' }}
      >
        {groups.map((g, i) => (
          // content-visibility: 화면 밖 날짜 섹션의 레이아웃·페인트를 건너뛴다. 사진이
          // 수천 장이어도 브라우저가 실제로 재는 건 보이는 몇 섹션뿐. 아직 한 번도 그려진
          // 적 없는 섹션은 아래 추정 높이로 자리만 잡고, 한 번 그려진 뒤엔 `auto` 가 실제
          // 높이를 기억한다. 좌우 여백(padding+음수 margin)은 paint containment 가 카드
          // hover ring 을 잘라내지 않게 낸 자리 — 레이아웃 위치는 그대로다.
          <div
            key={g.dateKey}
            style={{
              contentVisibility: 'auto',
              containIntrinsicSize: `auto ${estimateSectionHeight({
                assetCount: g.assets.length,
                storyCount: g.stories?.length ?? 0,
              })}px`,
              paddingInline: '8px',
              marginInline: '-8px',
            }}
          >
            {showDivider && i === boundaryIndex && (
              <div className="my-6 flex items-center gap-3 px-1">
                <span className="h-px flex-1 bg-base-200 dark:bg-base-800" />
                <span className="text-[12px] font-medium text-base-400">{t('grid.seenUpTo')}</span>
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
              dateKey={g.dateKey}
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

      {hasPending(pending) && !selectionMode && (
        <NewChangesPill
          count={pendingLabelCount(pending)}
          onApply={applyPending}
          onDismiss={() => updatePending(NO_PENDING)}
        />
      )}

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
        title={t('grid.confirmDeleteTitle', { count: selected.size })}
        description={t('grid.confirmDeleteDesc')}
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

/**
 * 깊이 스크롤한 사람에게 "새 사진이 있다"만 알리는 알약. 누르면 그때 새로고침하고,
 * 보고 있던 위치는 그대로 유지된다(새 사진은 위쪽에 쌓인다). 닫으면 조용해진다.
 */
function NewChangesPill({
  count,
  onApply,
  onDismiss,
}: {
  count: number
  onApply: () => void
  onDismiss: () => void
}) {
  const t = useTranslations('timeline')
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ top: 'calc(env(safe-area-inset-top) + 96px)' }}
    >
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-base-200/70 bg-base-0/95 py-1 pl-3 pr-1 shadow-elevated backdrop-blur-xl dark:border-base-800/70 dark:bg-base-900/95">
        <button
          type="button"
          onClick={onApply}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full py-1 pr-1 text-[13px] font-semibold text-point-600 transition active:scale-95 dark:text-point-400"
        >
          <ArrowUp size={14} strokeWidth={2.6} />
          {count > 0 ? t('grid.newPhotos', { count }) : t('grid.newChanges')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('grid.dismissNew')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base-400 transition hover:bg-base-100 dark:hover:bg-base-800"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>
    </div>
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
  const t = useTranslations('timeline')
  return (
    <div
      className="fixed inset-x-0 bottom-16 z-40 mx-auto flex max-w-md items-center gap-1.5 rounded-2xl border border-base-200/70 bg-base-0/95 p-2 shadow-elevated backdrop-blur-xl md:bottom-8 dark:border-base-800/70 dark:bg-base-900/95"
      style={{ marginInline: 'max(env(safe-area-inset-left), 16px)' }}
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label={t('grid.clearSelection')}
        className="flex h-9 w-9 items-center justify-center rounded-full text-base-500 transition hover:bg-base-100 dark:hover:bg-base-800"
      >
        <X size={18} strokeWidth={2} />
      </button>
      <span className="shrink-0 whitespace-nowrap px-1 text-[13px] font-medium tabular-nums">
        {t('grid.selectedCount', { count })}
      </span>
      <div className="flex-1" />
      <BulkDownloadButton
        assetIds={selectedIds}
        label=""
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 active:scale-95 disabled:opacity-60 dark:text-base-300 dark:hover:bg-base-800"
      />
      <SelectionShareButton assetIds={selectedIds} />
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('grid.delete')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <Trash2 size={18} strokeWidth={2.2} />
        </button>
      )}
      {canAlbum && (
        <button
          type="button"
          onClick={onAlbum}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-point-500 px-3 py-2 text-[13px] font-semibold text-white transition active:scale-95 hover:bg-point-600"
        >
          <FolderPlus size={14} strokeWidth={2.4} />
          {t('grid.addToAlbum')}
        </button>
      )}
    </div>
  )
}
