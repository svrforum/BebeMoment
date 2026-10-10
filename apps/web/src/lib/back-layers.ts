/**
 * 주소를 바꾸지 않는 '층'(하단 시트, 타임라인 사진 선택)이 떠 있는 동안의 뒤로가기가 **페이지를
 * 떠나는 대신 맨 위 층만 닫게** 한다.
 *
 * 왜 필요한가: 안드로이드 앱 셸의 뒤로가기는 `WebView.goBack()` 을 그대로 부르고, 뒤로 갈 항목이
 * 없으면 "한 번 더 누르면 종료" 를 띄운다. 층은 URL 을 바꾸지 않으니, 일정 수정 시트를 열고
 * 뒤로가면 시트는 뜬 채 뒤의 페이지만 넘어갔고, 타임라인에서 사진을 고르다 뒤로가면 선택이
 * 풀리는 대신 앱 종료를 물었다.
 *
 * 모양: 층이 열리면 히스토리에 같은 주소의 사본 항목을 하나 태우고, 뒤로가기가 그 사본을 떠나면
 * 층을 닫는다. 시트는 전부 사본 하나를 함께 쓰고(한 번에 다 닫힌다), 선택은 따로 하나를 쓴다.
 * 사본은 Navigation API 의 항목 key 로 알아본다 — 주소로만 가늠하면 탭을 오간 뒤 같은 주소의 다른
 * 항목을 사본으로 착각해, 선택을 푸는 대신 이전 탭으로 가거나 진짜 페이지를 건너뛰었다.
 *
 * 한 페이지 위에 연달아 태운 사본들(run)은 주소·state 가 같아 서로 바꿔 써도 되므로, 그 안에서
 * 어느 사본이 어느 층 것인지는 따지지 않는다 — 사본이 하나 빠질 때마다 그 묶음의 가장 위
 * 층(시트 > 선택)을 닫는다. 그래서 한 번에 둘이 켜지며 자식(시트)의 effect 가 부모(그리드)보다
 * 먼저 돌아 태우는 순서가 뒤집혀도 닫히는 순서는 맞다.
 *
 * ⚠️ 버튼·바깥 탭으로 닫힐 때는 곧바로 `history.back()` 으로 회수하지 **않는다** — 회수는 비동기라,
 * 닫히는 같은 순간에 다음 시트가 열리거나(추가 선택 → 업로드) 라우터가 이동하면 그 뒤로가기가 새
 * 시트의 사본을 빼거나 이동을 취소했다(e2e 가 잡았다). 그리고 우리가 일으킨 뒤로가기는 Next 가
 * 진행 중인 refresh 를 버리게 한다. 대신 사본을 '남은 것' 으로 두고, 그 사본 위에서 다음 층이
 * 열리면 이어받고, 뒤로가기로 남은 사본을 지나거나 그 위에 내려앉으면 같은 페이지의 원래 항목까지
 * 함께 거둬 누른 횟수만큼만 움직이게 한다. 손으로 닫은 선택만은 바로 거둔다(`takeLeftovers`).
 *
 * ⚠️ 뒤로가기를 처리하는 중에 사본을 **새로 태우지 말 것**(예: 시트를 닫고 선택용 사본을 다시
 * 태우기). 브라우저는 사용자 입력 없이 쌓인 항목을 뒤로가기 버튼에서 건너뛰고, 뒤로가기 직후엔 그
 * 전의 입력도 인정하지 않는다(Chromium history manipulation intervention). 문서의 항목이 모두
 * 건너뛸 것이 되면 WebView 의 canGoBack() 이 false 가 되어 다시 종료를 묻는다. 그래서 층마다
 * 열릴 때(탭·길게 누르기 직후) 미리 하나씩 태운다.
 */
export type BackLayer = 'selection' | 'sheet'

/** 아래 → 위. 뒤로가기는 열린 층 중 가장 위의 것을 닫는다. */
export const BOTTOM_TO_TOP: readonly BackLayer[] = ['selection', 'sheet']

/** 히스토리 항목 — Navigation API 의 key 와 그 순간의 주소. */
export type HistoryEntry = { key: string; url: string }

/** 한 페이지 위에 연달아 태운 사본들(아래 → 위, 태울 때의 주소와 함께)과 그중 하나씩을 쓰는 층. */
type Run = { copies: HistoryEntry[]; holders: Set<BackLayer> }

export type BackLayers = {
  runs: Run[]
  /** 층별로 열려 있는 수 — 시트는 여러 개가 함께 열릴 수 있다. */
  open: Record<BackLayer, number>
}

export function createBackLayers(): BackLayers {
  return { runs: [], open: { selection: 0, sheet: 0 } }
}

/**
 * 지금 서 있는 항목이 맨 위인 사본 묶음. 그 사본의 주소가 태울 때와 다르면(router.replace —
 * key 는 그대로 두고 주소만 바꾼다) 더 이상 아래 페이지의 사본이 아니므로 묶음으로 치지 않는다.
 * 그런 사본을 이어받으면, 일정을 지운 뒤 캘린더에서 연 시트를 뒤로가기로 닫을 때 지워진 일정
 * 페이지로 갔다.
 */
function runOnTop(s: BackLayers, current: HistoryEntry): Run | undefined {
  return s.runs.find((r) => {
    const top = r.copies.at(-1)
    return top?.key === current.key && top.url === current.url
  })
}

/**
 * 층이 열렸다. 사본이 필요하면 `push` 로 태우고 그 항목을 받는다. 지금 서 있는 항목이 남은
 * 사본이면 새로 태우지 않고 이어받는다.
 */
export function layerOpened(
  s: BackLayers,
  layer: BackLayer,
  current: HistoryEntry,
  push: () => HistoryEntry,
): void {
  s.open[layer] += 1
  if (s.runs.some((run) => run.holders.has(layer))) return
  const run = runOnTop(s, current)
  if (run && run.copies.length > run.holders.size) {
    run.holders.add(layer)
    return
  }
  const copy = push()
  const target = run ?? { copies: [], holders: new Set<BackLayer>() }
  if (!run) s.runs.push(target)
  target.copies.push({ key: copy.key, url: copy.url })
  target.holders.add(layer)
}

export function layerClosed(s: BackLayers, layer: BackLayer): void {
  s.open[layer] = Math.max(0, s.open[layer] - 1)
  if (s.open[layer] > 0) return
  for (const run of s.runs) run.holders.delete(layer)
}

/**
 * 지금 서 있는 사본 묶음의 남은 사본을 거두고 그 수를 돌려준다 — 셸이 그만큼 뒤로 간다. 우리
 * 사본 위에 서 있지 않으면(페이지를 떠나며 닫혔다) 0 이다. 거둔 항목은 더 이상 우리 것이 아니라,
 * 그 뒤로가기는 층을 닫거나 건너뛰지 않는다.
 */
export function takeLeftovers(s: BackLayers, current: HistoryEntry): number {
  const run = runOnTop(s, current)
  if (!run) return 0
  const count = run.copies.length - run.holders.size
  run.copies.splice(run.copies.length - count, count)
  if (run.copies.length === 0) s.runs.splice(s.runs.indexOf(run), 1)
  return count
}

/** 뒤로가기 한 번에 대한 반응 — 닫을 층과, 이어서 더 뒤로 갈 칸 수. */
export type BackStep = { close: BackLayer | null; back: number }

/**
 * 뒤로가기가 `fromKey` 항목을 떠나 `landing` 에 내려앉았다.
 * - 우리 사본을 떠났고 그 묶음에 열린 층이 있으면 가장 위 층을 닫는다.
 * - 남은 사본을 떠났으면 보이는 변화가 없었으니, 아래의 남은 사본을 다 지나 한 칸 더 간다.
 * - 내려앉은 곳이 남은 사본이면(다른 페이지에서 돌아왔다) 같은 페이지의 원래 항목까지 거둔다 —
 *   두면 다음 뒤로가기가 아무것도 바꾸지 못하고 헛돈다.
 */
export function layerLeftBack(s: BackLayers, fromKey: string, landing: HistoryEntry): BackStep {
  const run = s.runs.find((r) => r.copies.some((copy) => copy.key === fromKey))
  if (!run) return { close: null, back: takeLeftovers(s, landing) }
  run.copies.splice(
    run.copies.findIndex((copy) => copy.key === fromKey),
    1,
  )
  if (run.copies.length === 0) s.runs.splice(s.runs.indexOf(run), 1)
  const top = [...BOTTOM_TO_TOP].reverse().find((layer) => run.holders.has(layer))
  if (!top) return { close: null, back: takeLeftovers(s, landing) + 1 }
  // 사본을 먼저 내려놓는다 — 뒤이어 오는 닫힘이 이 층을 남은 것으로 세지 않게.
  run.holders.delete(top)
  return { close: top, back: takeLeftovers(s, landing) }
}
