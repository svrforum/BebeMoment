import type { AssetEvent } from '@bebe/core'

/**
 * 타임라인이 살아있는 동안 들어오는 가족 SSE 이벤트를 "지금 반영" / "모아뒀다가 사용자가
 * 누르면 반영" 중 어느 쪽으로 보낼지 정하는 순수 로직. 컴포넌트에서 분리해 둔 이유는
 * 이 판단이 스크롤 위치·페이지 수에 달려 있어 눈으로 재현하기 어렵기 때문이다.
 */

/** 이 아래면 "사실상 맨 위" — 지금 반영해도 보고 있던 사진을 잃지 않는다. */
export const AT_TOP_SCROLL_PX = 200

export type TimelineChange = 'added' | 'changed'

export function classifyEvent(event: AssetEvent): TimelineChange | null {
  if (event.type === 'asset.deleted') return 'changed'
  if (event.type !== 'asset.updated') return null
  if (event.status === 'ready') return 'added'
  if (event.status === 'failed') return 'changed'
  return null
}

export type PendingChanges = { added: number; changed: number }

export const NO_PENDING: PendingChanges = { added: 0, changed: 0 }

export function withPending(prev: PendingChanges, kind: TimelineChange): PendingChanges {
  return kind === 'added'
    ? { added: prev.added + 1, changed: prev.changed }
    : { added: prev.added, changed: prev.changed + 1 }
}

export function hasPending(p: PendingChanges): boolean {
  return p.added > 0 || p.changed > 0
}

/** 안내 문구에 쓰는 "새 사진 N장"의 N — 삭제·실패는 새 사진이 아니므로 세지 않는다. */
export function pendingLabelCount(p: PendingChanges): number {
  return p.added
}

/**
 * 맨 위에서 첫 페이지만 보고 있을 때만 즉시 새로고침한다. 그 밖에는 화면을 뺏지 않고
 * 안내만 띄운다 — 깊이 스크롤한 사람의 자리를 남의 업로드가 되돌려 놓던 회귀.
 */
export function shouldApplyImmediately(view: { scrollY: number; pagesLoaded: number }): boolean {
  return view.scrollY < AT_TOP_SCROLL_PX && view.pagesLoaded <= 1
}

export type ViewState = { scrollY: number; pagesLoaded: number }
export type LiveDecision = {
  /** true 면 지금 `router.refresh()`. false 면 목록을 건드리지 않는다. */
  refreshNow: boolean
  pending: PendingChanges
}

export function receiveEvent(
  pending: PendingChanges,
  event: AssetEvent,
  view: ViewState,
): LiveDecision {
  const kind = classifyEvent(event)
  if (!kind) return { refreshNow: false, pending }
  if (shouldApplyImmediately(view)) return { refreshNow: true, pending: NO_PENDING }
  return { refreshNow: false, pending: withPending(pending, kind) }
}
