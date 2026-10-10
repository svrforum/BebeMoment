import { describe, expect, it } from 'vitest'
import {
  type BackLayer,
  type BackLayers,
  type HistoryEntry,
  createBackLayers,
  layerClosed,
  layerLeftBack,
  layerOpened,
  takeLeftovers,
} from './back-layers'

/**
 * 브라우저 히스토리 흉내. 항목마다 key(Navigation API 의 currentEntry.key)와 주소가 있고, 우리가
 * 태우는 사본도, Next 의 페이지 이동도 같은 스택에 쌓인다. 페이지 항목은 key 와 주소가 같다.
 * 뒤로가기는 셸(`components/shell/back-layer.ts`)이 하듯 처리한다 — 층을 닫고, 돌려받은 칸 수만큼
 * 더 가되 이 사이트의 첫 항목 아래로는 가지 않는다(앱에서는 그 아래가 셸의 시작 화면이다).
 */
function setup(...pages: string[]) {
  const s: BackLayers = createBackLayers()
  const stack: HistoryEntry[] = pages.map((page) => ({ key: page, url: page }))
  let at = stack.length - 1
  let made = 0
  const entry = (): HistoryEntry => stack[at] ?? { key: '', url: '' }
  const pushEntry = (next: HistoryEntry): HistoryEntry => {
    stack.splice(at + 1)
    stack.push(next)
    at += 1
    return next
  }
  /** `from` 을 떠나 지금 항목에 내려앉은 뒤의 처리 — 닫힌 층을 돌려준다. */
  const settle = (from: string): BackLayer | null => {
    let closed: BackLayer | null = null
    let left = from
    for (;;) {
      const step = layerLeftBack(s, left, { ...entry() })
      closed = closed ?? step.close
      const more = Math.min(step.back, at)
      if (more === 0) return closed
      left = entry().key
      at -= more
    }
  }
  const h = {
    get current(): string {
      return entry().key
    },
    get url(): string {
      return entry().url
    },
    /** 페이지 이동(Next push). */
    push(page: string): void {
      pushEntry({ key: page, url: page })
    },
    /** router.replace — key 는 그대로, 주소만 바뀐다. */
    replace(url: string): void {
      entry().url = url
    },
    open(layer: BackLayer): void {
      layerOpened(s, layer, { ...entry() }, () =>
        pushEntry({ key: `copy${++made}`, url: entry().url }),
      )
    },
    close(layer: BackLayer): void {
      layerClosed(s, layer)
    },
    /** 뒤로가기 한 번. 더 갈 곳이 없으면(첫 항목) 앱이 종료를 묻는다 — 'exit'. */
    pressBack(): BackLayer | 'exit' | null {
      if (at === 0) return 'exit'
      const from = entry().key
      at -= 1
      return settle(from)
    },
    /** 손으로 닫은 뒤 남은 사본을 거둔다(셸의 dropLeftoverCopies). */
    reclaim(): number {
      const count = takeLeftovers(s, { ...entry() })
      if (count === 0) return 0
      const from = entry().key
      at -= count
      expect(settle(from)).toBeNull()
      return count
    },
    get depth(): number {
      return at
    },
  }
  return h
}

describe('시트와 뒤로가기', () => {
  it('열리면 히스토리 항목을 하나 태우고, 뒤로가기는 페이지를 떠나는 대신 시트를 닫는다', () => {
    const h = setup('prev', 'A')
    h.open('sheet')
    expect(h.depth).toBe(2)
    expect(h.pressBack()).toBe('sheet')
    h.close('sheet')
    expect(h.current).toBe('A')
  })

  it('여러 시트가 함께 열려도 항목은 하나다', () => {
    const h = setup('prev', 'A')
    h.open('sheet')
    h.open('sheet')
    expect(h.depth).toBe(2)
    expect(h.pressBack()).toBe('sheet')
    h.close('sheet')
    h.close('sheet')
    expect(h.current).toBe('A')
  })

  it('버튼으로 닫으면 히스토리를 건드리지 않고, 다음 뒤로가기는 남은 사본을 지나 페이지를 떠난다', () => {
    const h = setup('prev', 'A')
    h.open('sheet')
    h.close('sheet')
    expect(h.pressBack()).toBeNull()
    expect(h.current).toBe('prev')
  })

  it('첫 항목에서는 남은 사본을 지나도 그 아래로 가지 않는다 — 앱 셸의 시작 화면이 다시 뜬다', () => {
    const h = setup('A')
    h.open('sheet')
    h.close('sheet')
    expect(h.pressBack()).toBeNull()
    expect(h.current).toBe('A')
    expect(h.pressBack()).toBe('exit')
  })

  it('시트가 닫히며 곧바로 다음 시트가 열리면 항목을 이어받는다 — 히스토리를 또 쌓지 않는다', () => {
    // 추가 선택 시트 → 업로드 시트. 닫힘 때 뒤로가기로 회수하면 그 뒤로가기가 업로드 시트의
    // 항목을 빼서 업로드 시트가 열리자마자 닫혔다(e2e 에서 발견).
    const h = setup('A')
    h.open('sheet')
    h.close('sheet')
    h.open('sheet')
    expect(h.depth).toBe(1)
    expect(h.pressBack()).toBe('sheet')
  })

  it('시트 안 링크로 다른 페이지에 갔다가 돌아오면, 남은 사본까지 거둬 한 번에 원래 페이지로 온다', () => {
    const h = setup('prev', 'calendar')
    h.open('sheet')
    h.close('sheet')
    h.push('timeline?date')
    expect(h.pressBack()).toBeNull()
    expect(h.current).toBe('calendar')
    expect(h.pressBack()).toBeNull()
    expect(h.current).toBe('prev')
  })

  it('남은 사본의 주소가 router.replace 로 바뀌었으면 이어받지 않고 새로 태운다', () => {
    // 일정 삭제: 확인 시트의 사본 위에서 router.replace('/calendar'). 그 사본을 다음 시트가
    // 이어받으면, 뒤로가기가 시트를 닫으면서 지워진 일정 페이지로 갔다.
    const h = setup('schedule/123')
    h.open('sheet')
    h.replace('calendar')
    h.close('sheet')
    h.open('sheet')
    expect(h.depth).toBe(2)
    expect(h.pressBack()).toBe('sheet')
    expect(h.url).toBe('calendar')
  })

  it('해시 이동(#composer)처럼 우리 것이 아닌 항목이 쌓여도 시트를 닫지 않는다', () => {
    const h = setup('A')
    h.open('sheet')
    h.push('A#composer')
    expect(h.pressBack()).toBeNull()
    expect(h.pressBack()).toBe('sheet')
  })
})

describe('사진 선택과 뒤로가기', () => {
  it('선택을 시작하면 항목을 태우고, 뒤로가기는 선택만 푼다', () => {
    const h = setup('timeline')
    h.open('selection')
    expect(h.pressBack()).toBe('selection')
    h.close('selection')
    expect(h.current).toBe('timeline')
    expect(h.pressBack()).toBe('exit')
  })

  it('선택 중에 연 시트는 따로 항목을 태우고, 뒤로가기는 시트 → 선택 순으로 하나씩 닫는다', () => {
    // 여러 장 골라 '앨범에 추가' 를 연 상태에서 뒤로 → 앨범 시트만 닫히고 고른 사진은 그대로.
    const h = setup('timeline')
    h.open('selection')
    h.open('sheet')
    expect(h.depth).toBe(2)
    expect(h.pressBack()).toBe('sheet')
    h.close('sheet')
    expect(h.pressBack()).toBe('selection')
    h.close('selection')
    expect(h.current).toBe('timeline')
  })

  it('같은 순간에 시트가 먼저 열려도 뒤로가기는 시트부터 닫는다', () => {
    // 우클릭·길게 누르기 메뉴의 '앨범에 추가' 는 선택과 시트를 한 번에 켠다. 자식(시트)의
    // effect 가 부모(그리드)보다 먼저 돌아 항목을 태우는 순서가 뒤집힌다.
    const h = setup('timeline')
    h.open('sheet')
    h.open('selection')
    expect(h.pressBack()).toBe('sheet')
    h.close('sheet')
    expect(h.pressBack()).toBe('selection')
  })

  it('선택 위의 시트를 버튼으로 닫으면, 다음 뒤로가기는 선택을 풀고 남은 사본까지 거둔다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.open('sheet')
    h.close('sheet')
    expect(h.pressBack()).toBe('selection')
    h.close('selection')
    expect(h.current).toBe('timeline')
    expect(h.pressBack()).toBe('exit')
  })

  it('X 로 선택을 풀면 남은 사본을 바로 거둔다 — 첫 화면에서 뒤로가기 한 번이 헛돌지 않게', () => {
    const h = setup('timeline')
    h.open('selection')
    h.close('selection')
    expect(h.reclaim()).toBe(1)
    expect(h.current).toBe('timeline')
    expect(h.pressBack()).toBe('exit')
  })

  it('삭제 확인 시트와 선택이 차례로 닫히면 남은 사본 둘을 함께 거둔다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.open('sheet')
    h.close('sheet')
    h.close('selection')
    expect(h.reclaim()).toBe(2)
    expect(h.current).toBe('timeline')
  })

  it('앨범 시트가 아직 열려 있으면 선택의 몫만 거두고, 시트는 계속 뒤로가기로 닫힌다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.open('sheet')
    h.close('selection')
    expect(h.reclaim()).toBe(1)
    expect(h.pressBack()).toBe('sheet')
    expect(h.current).toBe('timeline')
  })

  it('페이지를 떠나며 선택이 닫히면 거두지 않는다 — 막 시작된 이동을 되돌리게 된다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.push('calendar')
    h.close('selection')
    expect(h.reclaim()).toBe(0)
    expect(h.current).toBe('calendar')
  })

  it('사본의 주소가 바뀌었으면 거두지 않는다 — 거두는 뒤로가기가 이전 주소로 되돌리게 된다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.replace('timeline?sort=uploaded')
    h.close('selection')
    expect(h.reclaim()).toBe(0)
    expect(h.url).toBe('timeline?sort=uploaded')
  })

  it('뒤로가기로 선택을 풀었으면 거둘 것이 없다', () => {
    const h = setup('timeline')
    h.open('selection')
    expect(h.pressBack()).toBe('selection')
    h.close('selection')
    expect(h.reclaim()).toBe(0)
  })

  it('X 로 푼 뒤 다른 탭에 갔다 오면, 새로 고를 때 남은 사본을 이어받지 않고 새로 태운다', () => {
    // 이어받으면 사본이 캘린더 아래에 묻혀 있어서, 뒤로가기가 선택을 푸는 대신 캘린더로 갔다.
    const h = setup('timeline')
    h.open('selection')
    h.close('selection') // 거두기 전에 이동했다고 친다
    h.push('calendar')
    h.push('timeline2')
    h.open('selection')
    expect(h.current).not.toBe('timeline2')
    expect(h.pressBack()).toBe('selection')
    h.close('selection')
    expect(h.current).toBe('timeline2')
  })

  it('남은 사본은 그 위에서 내려올 때만 다룬다 — 나중에 다시 연 같은 페이지는 건너뛰지 않는다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.close('selection')
    h.push('calendar')
    h.push('timeline2')
    h.push('calendar2')
    expect(h.pressBack()).toBeNull()
    expect(h.current).toBe('timeline2')
  })

  it('캘린더 시트가 남긴 사본은, 다른 페이지에서 선택을 하고 돌아와도 거둬진다', () => {
    const h = setup('prev', 'calendar')
    h.open('sheet')
    h.close('sheet') // '사진 모두 보기' 링크
    h.push('timeline?date')
    h.open('selection')
    expect(h.pressBack()).toBe('selection')
    h.close('selection')
    expect(h.pressBack()).toBeNull() // 날짜 화면 → 캘린더(사본까지 거둔다)
    expect(h.current).toBe('calendar')
    expect(h.pressBack()).toBeNull()
    expect(h.current).toBe('prev')
  })

  it('선택 중 정렬을 바꾸면, 뒤로가기는 정렬을 되돌리고 선택은 남긴다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.push('timeline?sort=uploaded')
    expect(h.pressBack()).toBeNull()
    expect(h.current).not.toBe('timeline')
    expect(h.pressBack()).toBe('selection')
    expect(h.current).toBe('timeline')
  })

  it('선택 중에 다른 탭으로 가면, 돌아올 때 남은 사본까지 거둬 첫 화면에서 바로 종료를 묻는다', () => {
    const h = setup('timeline')
    h.open('selection')
    h.push('calendar')
    h.close('selection') // 그리드가 사라진다
    expect(h.pressBack()).toBeNull()
    expect(h.current).toBe('timeline')
    expect(h.pressBack()).toBe('exit')
  })
})
