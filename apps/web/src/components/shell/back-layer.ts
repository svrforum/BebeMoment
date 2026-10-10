import * as byKey from '@/lib/back-layers'
import type { BackLayer, HistoryEntry } from '@/lib/back-layers'
import { type SheetHistory, sheetClosed, sheetOpened, sheetPopState } from '@/lib/sheet-back'
import { useEffect, useRef } from 'react'

/**
 * 층이 열려 있는 동안 뒤로가기는 그 층만 닫는다(`lib/back-layers.ts`). 상태와 리스너는 모듈에
 * 하나만 둔다. 사본을 태울 때 **Next 의 현재 state 를 그대로 재사용**한다 — 임의의 state 를 넣으면
 * App Router 가 popstate 를 자기 항목으로 못 알아보고 전체 새로고침을 할 수 있다. URL 도 바꾸지 않는다.
 */
type Driver = {
  opened: (layer: BackLayer) => void
  closed: (layer: BackLayer) => void
  dropLeftovers: () => void
}

const members: Record<BackLayer, Set<{ close: () => void }>> = {
  selection: new Set(),
  sheet: new Set(),
}

const driver: Driver | null =
  typeof window === 'undefined'
    ? null
    : 'navigation' in window && window.navigation?.currentEntry
      ? keyDriver(window.navigation)
      : urlDriver()

function keyDriver(navigation: Navigation): Driver {
  const state = byKey.createBackLayers()
  navigation.addEventListener('currententrychange', (event) => {
    const to = navigation.currentEntry
    if (event.navigationType !== 'traverse' || !event.from || !to) return
    if (to.index >= event.from.index) return
    afterBack()
    const step = byKey.layerLeftBack(state, event.from.key, here(navigation))
    if (step.close) closeAll(step.close)
    // 이 사이트의 첫 항목 아래로는 가지 않는다 — 앱에서는 그 아래가 셸의 시작 화면
    // (https://localhost)이라 앱 전체가 처음부터 다시 떴다. 그때 이 뒤로가기는 헛돌고, 다음
    // 뒤로가기에 앱이 종료를 묻는다.
    const more = Math.min(step.back, to.index)
    if (more > 0) window.history.go(-more)
  })
  return {
    opened: (layer) =>
      byKey.layerOpened(state, layer, here(navigation), () => {
        pushCopy()
        return here(navigation)
      }),
    closed: (layer) => byKey.layerClosed(state, layer),
    dropLeftovers: () => {
      // 한 틱 미뤄 이번 입력으로 닫히는 층이 먼저 닫히고, 같은 순간 열린 층이 먼저 이어받게 한다.
      // 그때도 우리 사본 위에 서 있을 때만 거둔다.
      setTimeout(() => {
        const count = byKey.takeLeftovers(state, here(navigation))
        if (count > 0) window.history.go(-count)
      })
    },
  }
}

function here(navigation: Navigation): HistoryEntry {
  return { key: navigation.currentEntry?.key ?? '', url: navigation.currentEntry?.url ?? '' }
}

/**
 * Navigation API 가 없는 브라우저는 시트만 예전 방식(`lib/sheet-back.ts`)으로 묶는다. 주소로만
 * 가늠하면 사진 선택까지는 감당하지 못한다 — 그 브라우저에서 선택 중 뒤로가기는 예전처럼
 * 페이지를 떠난다.
 */
function urlDriver(): Driver {
  const state: SheetHistory = { entry: 'none', href: '', open: 0 }
  window.addEventListener('popstate', () => {
    afterBack()
    const action = sheetPopState(state, location.href)
    if (action === 'close-all') closeAll('sheet')
    else if (action === 'skip') window.history.back()
  })
  return {
    opened: (layer) => {
      if (layer === 'sheet' && sheetOpened(state, location.href) === 'push') pushCopy()
    },
    closed: (layer) => {
      if (layer === 'sheet') sheetClosed(state)
    },
    dropLeftovers: () => {},
  }
}

/**
 * 같은 주소의 사본을 태운다. 떠나는 항목은 다시 내려앉을 때 스크롤을 복원하지 않게 표시한다 —
 * 고르면서 스크롤한 뒤 뒤로가기로 선택을 풀면, 브라우저가 그 항목에 저장된 '고르기 시작한 위치'
 * 로 화면을 되돌렸다. 사본 자체는 원래 방식 그대로 둔다(다른 페이지에서 돌아올 때는 복원돼야 한다).
 */
function pushCopy(): void {
  const { history } = window
  const mode = history.scrollRestoration
  history.scrollRestoration = 'manual'
  history.pushState(history.state, '', location.href)
  history.scrollRestoration = mode
}

/**
 * 표시해 둔 항목에 내려앉았다 — 이번 복원이 건너뛰어진 뒤 원래대로 되돌린다. 그대로 두면 상세에
 * 갔다가 돌아올 때도 위치를 잃는다. 복원은 popstate 직후에 일어나므로 한 틱 늦춘다.
 */
function afterBack(): void {
  if (window.history.scrollRestoration !== 'manual') return
  setTimeout(() => {
    window.history.scrollRestoration = 'auto'
  })
}

function closeAll(layer: BackLayer): void {
  for (const member of [...members[layer]]) member.close()
}

/**
 * 버튼으로 닫혀 남은 사본을 거둔다 — 첫 화면(타임라인)에 남은 사본은 다음 뒤로가기 한 번을
 * 헛돌게 한다. **손으로 끝낼 때(X·Esc·마지막 사진 해제)만** 부를 것: 거두는 뒤로가기(popstate)가
 * 오면 Next 가 진행 중인 라우터 동작을 버린다. 삭제·앨범 추가 뒤의 router.refresh() 가 버려지면
 * 지운 사진이 화면에 남는다. 시트도 부르지 않는다 — 시트 안 링크로 이동하며 닫힐 때 그 이동이
 * 취소된다.
 */
export function dropLeftoverCopies(): void {
  driver?.dropLeftovers()
}

export function useBackLayer(layer: BackLayer, open: boolean, onBack: () => void): void {
  const back = useRef(onBack)
  back.current = onBack

  useEffect(() => {
    if (!open || !driver) return
    const me = { close: () => back.current() }
    members[layer].add(me)
    driver.opened(layer)
    return () => {
      members[layer].delete(me)
      driver.closed(layer)
    }
  }, [layer, open])
}
