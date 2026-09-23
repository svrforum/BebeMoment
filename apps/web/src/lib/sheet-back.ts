/**
 * 하단 시트가 열려 있는 동안의 뒤로가기가 **페이지를 떠나는 대신 시트만 닫게** 한다.
 *
 * 왜 필요한가: 안드로이드 앱 셸의 뒤로가기는 `WebView.goBack()` 을 그대로 부르고, 시트는
 * URL 을 바꾸지 않는다. 그래서 일정 수정 시트를 열고 뒤로가면 시트는 그대로 뜬 채 뒤의
 * 페이지만 캘린더로 넘어갔다(시트를 들고 있는 쪽이 앱 셸이라 페이지가 바뀌어도 안 닫힌다).
 *
 * 모양: 모든 시트가 **히스토리 항목 하나를 함께** 쓴다. 열 때 하나 태우고, 뒤로가기는 그걸
 * 소비해 시트를 닫는다. ⚠️ 버튼·바깥 탭으로 닫힐 때는 `history.back()` 으로 회수하지 **않는다**
 * — 회수는 비동기라, 닫히는 같은 순간에 다음 시트가 열리거나(추가 선택 → 업로드) 라우터가
 * 이동하면 그 뒤로가기가 새 시트의 항목을 빼거나 이동을 취소했다(e2e 가 잡았다). 대신 항목을
 * '남은 것' 으로 두고, 다음 시트가 열리면 이어받고, 뒤로가기로 그 사본에 닿으면 한 칸 더
 * 건너뛰어 누른 횟수만큼만 움직이게 한다.
 */
export type SheetHistory = {
  /** none: 태운 게 없음 · live: 열린 시트가 쓰는 중 · stale: 시트는 닫혔고 사본 항목만 남음 */
  entry: 'none' | 'live' | 'stale'
  /** 항목을 태운 페이지 주소. */
  href: string
  /** 지금 열려 있는 시트 수. */
  open: number
}

export function sheetOpened(s: SheetHistory, href: string): 'push' | 'none' {
  s.open += 1
  if (s.entry === 'live') return 'none'
  if (s.entry === 'stale' && s.href === href) {
    s.entry = 'live'
    return 'none'
  }
  s.entry = 'live'
  s.href = href
  return 'push'
}

export function sheetClosed(s: SheetHistory): void {
  s.open = Math.max(0, s.open - 1)
  if (s.open === 0 && s.entry === 'live') s.entry = 'stale'
}

export function sheetPopState(s: SheetHistory, href: string): 'close-all' | 'skip' | 'none' {
  if (s.entry === 'live' && s.open > 0) {
    s.entry = 'none'
    return 'close-all'
  }
  if (s.entry === 'stale') {
    s.entry = 'none'
    return s.href === href ? 'skip' : 'none'
  }
  return 'none'
}
