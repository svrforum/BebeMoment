/** 주소창이 접히는 정도의 잔떨림은 키보드로 치지 않는다. */
const OVERLAP_MIN_PX = 60

/**
 * 소프트 키보드가 레이아웃 뷰포트 **위에 떠 있는가**(= 레이아웃은 그대로인데 보이는 영역만
 * 줄었는가). 키보드가 레이아웃 뷰포트를 실제로 줄이는 브라우저에서는 두 높이가 같이 줄어
 * false 가 되고, 그때는 하단 고정 요소를 손으로 들어 올릴 필요가 없다.
 */
export function keyboardOverlaysLayout(innerHeight: number, visualViewportHeight: number): boolean {
  return innerHeight - visualViewportHeight >= OVERLAP_MIN_PX
}
