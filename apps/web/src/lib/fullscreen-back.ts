/**
 * 영상이 네이티브 전체화면으로 들어가는 동안 히스토리에 항목을 하나 태워, 뒤로가기가
 * **페이지를 떠나는 대신 전체화면만 닫게** 만든다.
 *
 * 왜 필요한가: 안드로이드 앱 셸의 뒤로가기는 `WebView.goBack()` 을 그대로 부른다.
 * 영상의 네이티브 전체화면은 URL 을 바꾸지 않으므로, 전체화면 중에 뒤로가기를 누르면
 * 전체화면이 닫히는 게 아니라 **그 페이지의 이전 항목**으로 넘어가 버렸다 — 스토리에서
 * 영상을 전체화면으로 보다가 뒤로가면 타임라인으로 튕겼다(스토리 앞 항목이 타임라인).
 *
 * 여기 있는 두 함수는 그 상태 기계다. DOM·히스토리 조작은 훅이 하고, 순서(뒤로가기로
 * 나가기 / 컨트롤로 나가기)만 여기서 결정한다.
 */
export type FullscreenBackState = { pushed: boolean }

/** 전체화면 진입·이탈에 대한 반응. `back` 은 우리가 태운 항목을 회수한다는 뜻. */
export function reduceFullscreenChange(
  state: FullscreenBackState,
  isFullscreen: boolean,
): 'push' | 'back' | 'none' {
  if (isFullscreen) {
    if (state.pushed) return 'none'
    state.pushed = true
    return 'push'
  }
  if (!state.pushed) return 'none'
  // 컨트롤(또는 ESC)로 나갔다 — 우리가 태운 항목이 남아 있으면 다음 뒤로가기가
  // 아무 일도 안 하는 것처럼 보인다. 지금 회수한다.
  state.pushed = false
  return 'back'
}

/**
 * 뒤로가기(popstate)에 대한 반응. 우리가 태운 항목이 빠지는 순간이므로 `pushed` 를 먼저
 * 내린다 — 그래야 뒤이어 오는 fullscreenchange 가 `back` 을 또 호출해 진짜로 페이지를
 * 떠나는 일이 없다.
 */
export function reducePopState(state: FullscreenBackState, isFullscreen: boolean): 'exit' | 'none' {
  if (!state.pushed) return 'none'
  state.pushed = false
  return isFullscreen ? 'exit' : 'none'
}
