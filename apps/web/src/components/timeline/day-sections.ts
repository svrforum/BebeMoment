/** 그리드의 날짜 섹션 표식. 스크러버와 '돌아왔을 때 이어 보기'가 지금 보고 있는 날을 이걸로 찾는다. */
export const DAY_SECTION_ATTR = 'data-timeline-day'

/** 상단 헤더 아랫변(뷰포트 기준). 날짜로 스크롤할 때 헤더 밑에 맞추는 데도 쓴다. */
export function appHeaderBottom(): number {
  return document.querySelector('[data-app-header]')?.getBoundingClientRect().bottom ?? 0
}

/** 아랫변이 기준선(뷰포트 y)보다 아래인 첫 날짜 섹션 — 그 선에 걸려 있는 날. */
export function daySectionAt(line: number): HTMLElement | null {
  const sections = document.querySelectorAll<HTMLElement>(`[${DAY_SECTION_ATTR}]`)
  if (sections.length === 0) return null
  // 섹션은 위에서 아래로 놓여 있다 — 이분 탐색.
  let lo = 0
  let hi = sections.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const el = sections[mid]
    if (el && el.getBoundingClientRect().bottom <= line) lo = mid + 1
    else hi = mid
  }
  return sections[lo] ?? null
}

/**
 * 화면 맨 위(헤더 밑)에 걸린 날짜 섹션과 그 윗변의 화면상 y. 섹션 **바깥 상자**로 잰다 — 안쪽의
 * 섹션·사진은 등장 애니메이션(translate) 중이라, 돌아온 직후에 재면 15px 쯤 어긋난 값이 나온다.
 */
export type ScrollAnchor = { dayKey: string; top: number }

export function readAnchor(): ScrollAnchor | null {
  const section = daySectionAt(appHeaderBottom())
  const dayKey = section?.getAttribute(DAY_SECTION_ATTR)
  if (!section || !dayKey) return null
  return { dayKey, top: section.getBoundingClientRect().top }
}

/** 기억해 둔 날짜 섹션을 떠날 때와 같은 화면 높이에 세운다. */
export function scrollToAnchor(anchor: ScrollAnchor): void {
  const section = document.querySelector(`[${DAY_SECTION_ATTR}="${anchor.dayKey}"]`)
  if (!section) return
  const delta = section.getBoundingClientRect().top - anchor.top
  if (delta !== 0) window.scrollBy({ top: delta, behavior: 'instant' })
}
