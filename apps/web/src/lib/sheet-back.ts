/**
 * 하단 시트가 열려 있는 동안의 뒤로가기가 **페이지를 떠나는 대신 시트만 닫게** 한다.
 *
 * 왜 필요한가: 안드로이드 앱 셸의 뒤로가기는 `WebView.goBack()` 을 그대로 부르고, 시트는
 * URL 을 바꾸지 않는다. 그래서 일정 수정 시트를 열고 뒤로가면 시트는 그대로인 채 **뒤의
 * 페이지만** 캘린더로 넘어갔다(시트를 들고 있는 쪽이 앱 셸이라 페이지가 바뀌어도 안 닫힌다).
 *
 * 영상 전체화면(`fullscreen-back.ts`)과 같은 방식이다 — 열 때 항목을 하나 태우고, 뒤로가기는
 * 그 항목만 소비한다. 순서 규칙만 여기서 정하고 DOM·히스토리는 `Sheet` 가 만진다.
 */
export type SheetBackState = {
  pushed: boolean
  /** 태운 직후의 `history.length`. 닫힐 때 그 사이 다른 이동이 있었는지 가린다. */
  length: number
  href: string
  /**
   * 시트 안의 링크를 눌렀다. 라우터는 페이지를 받아 온 뒤에야 히스토리에 항목을 쌓으므로 시트가
   * 닫히는 순간엔 길이·주소가 그대로다 — 이 표시 없이 회수하면 막 시작된 이동이 취소된다.
   */
  navigating: boolean
}

type Now = { length: number; href: string }

export function reduceSheetOpenChange(
  state: SheetBackState,
  open: boolean,
  now: Now,
): 'push' | 'back' | 'none' {
  if (open) {
    if (state.pushed) return 'none'
    state.pushed = true
    state.navigating = false
    state.href = now.href
    return 'push'
  }
  if (!state.pushed) return 'none'
  state.pushed = false
  if (state.navigating) return 'none'
  // 시트 안의 링크로 다른 페이지에 가면서 닫혔다면 그 이동이 새 항목을 쌓았다 — 여기서
  // 뒤로가면 방금 한 이동이 취소된다. 우리가 태운 항목이 여전히 맨 위일 때만 회수한다.
  return now.length === state.length && now.href === state.href ? 'back' : 'none'
}

/** 뒤로가기로 우리가 태운 항목이 빠졌다. 먼저 `pushed` 를 내려 뒤따르는 닫힘이 또 회수하지 않게. */
export function reduceSheetPopState(state: SheetBackState, open: boolean): 'close' | 'none' {
  if (!state.pushed) return 'none'
  state.pushed = false
  return open ? 'close' : 'none'
}
