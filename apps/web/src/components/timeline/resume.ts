import { createEntryMemory } from '@/lib/entry-memory'
import type { ScrollAnchor } from './day-sections'
import { type BucketGroup, reconcileHead } from './groups'

/**
 * 사진을 열었다가 뒤로가기로 돌아오면 그리드는 처음부터 다시 만들어진다 — 서버가 준 첫 페이지만
 * 든 채로. 그 아래에서 보고 있던 자리(스크롤로 내려갔든 날짜 손잡이로 건너뛰었든)는 브라우저가
 * 되돌릴 곳이 없어 첫 페이지 끝으로 밀렸고, '더보기'로 펼친 날도 다시 접혔다.
 *
 * 그래서 화면을 떠나는 순간의 목록·펼친 날·화면 맨 위에 걸린 날짜의 자리를 **그 히스토리 항목
 * 앞으로** 적어 두고, 같은 항목에 돌아온 그리드가 되살린다. 탭을 눌러 새로 연 타임라인은 다른 항목이라 받지
 * 않는다. Navigation API 가 없는 브라우저에서는 아무것도 하지 않는다(예전 동작 그대로).
 */
export type TimelineView = {
  /** 어느 목록인지(컬렉션·정렬·날짜) — 다른 목록의 기억을 잘못 되살리지 않게. */
  scope: string
  groups: BucketGroup[]
  cursor: string | null
  pagesLoaded: number
  expanded: ReadonlySet<string>
  anchor: ScrollAnchor | null
}

export type Remembered = Omit<TimelineView, 'expanded'> & { expanded: string[] }

export type SectionPart = 'photos' | 'stories'

export function expandedKey(part: SectionPart, dateKey: string): string {
  return `${part}:${dateKey}`
}

export const timelineMemory = createEntryMemory<Remembered>(4)

export function historyEntries(): Navigation | null {
  if (typeof window === 'undefined' || !('navigation' in window)) return null
  return window.navigation?.currentEntry ? window.navigation : null
}

let resetQueued = false

/**
 * 지금 항목을 "스크롤은 브라우저가 되돌리지 않는다"로 표시한다 — 돌아왔을 때 자리는 그리드가 잡는다.
 * 브라우저는 떠날 때의 스크롤 **값**을 되돌리는데, 그것도 우리가 자리를 잡은 뒤에 덮어쓴다. 새로 만든
 * 섹션의 높이가 떠날 때와 조금이라도 다르면(그려진 적 없는 섹션은 추정 높이였다) 그만큼 어긋난다.
 *
 * `navigate` 처리 중에 부를 것: 표시는 지금 항목에 남고, pushState 가 만드는 새 항목이 그 표시를
 * 물려받는다 — 그 화면까지 복원을 잃지 않게 항목이 바뀌자마자 되돌린다. 뒤로·앞으로 가는 이동은
 * 물려받지 않으므로(도착 항목은 제 표시를 갖고 있다) 건드리지 않는다.
 */
export function keepScrollOurs(entries: Navigation): void {
  window.history.scrollRestoration = 'manual'
  if (resetQueued) return
  resetQueued = true
  entries.addEventListener(
    'currententrychange',
    (event) => {
      resetQueued = false
      if (event.navigationType !== 'traverse') window.history.scrollRestoration = 'auto'
    },
    { once: true },
  )
}

/**
 * 표시해 둔 항목에 돌아왔다 — 이번 복원은 이미 건너뛰어졌으니 원래대로 돌린다. 그대로 두면 다음에
 * 기억 없이 돌아올 때(첫 페이지에서 떠난 경우) 브라우저도 복원하지 않아 맨 위에 선다. 복원 여부는
 * 이동 직후에 정해지므로 한 틱 늦춘다(`back-layer.ts` 의 afterBack 과 같은 이유).
 */
export function giveScrollBack(): void {
  if (window.history.scrollRestoration !== 'manual') return
  setTimeout(() => {
    window.history.scrollRestoration = 'auto'
  })
}

/** 떠날 때 적어 둘 것. 첫 페이지뿐이고 펼친 날도 없으면 브라우저의 스크롤 복원만으로 제자리라 null. */
export function snapshotOf(view: TimelineView): Remembered | null {
  if (view.pagesLoaded <= 1 && view.expanded.size === 0) return null
  return { ...view, expanded: [...view.expanded] }
}

/**
 * 돌아온 그리드가 이어 볼 상태. `fresh` 는 서버가 이번에 준 첫 페이지 — 그사이 달라졌으면 머리는
 * 그것으로 바꾼다. 이어붙일 자리를 못 찾으면 null(새 목록으로 시작). `removed` 는 그사이 지운
 * 사진(`lib/removed-assets.ts`) — 기억해 둔 목록은 지우기 전 것이라 걸러 낸다.
 */
export function resumeView(
  saved: Remembered | undefined,
  scope: string,
  fresh: BucketGroup[],
  removed: ReadonlySet<string>,
): Remembered | null {
  if (!saved || saved.scope !== scope) return null
  const { groups, keptPages } = reconcileHead(saved.groups, fresh)
  if (!keptPages) return null
  return { ...saved, groups: removed.size > 0 ? withoutAssets(groups, removed) : groups }
}

function withoutAssets(groups: BucketGroup[], ids: ReadonlySet<string>): BucketGroup[] {
  return groups.flatMap((g) => {
    if (!g.assets.some((a) => ids.has(a.id))) return [g]
    const assets = g.assets.filter((a) => !ids.has(a.id))
    // 사진이 다 빠져도 스토리가 걸린 날은 자리를 지킨다.
    return assets.length > 0 || (g.stories?.length ?? 0) > 0 ? [{ ...g, assets }] : []
  })
}
