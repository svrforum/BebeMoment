/**
 * 성장 기록 폼의 저장 버튼을 열어줄지. 목적은 "측정값 없는 빈 기록 생성"을 막는 것이라,
 * 이 폼이 더는 보여주지 않는 측정값(머리둘레)만 가진 옛 기록의 수정까지 막지는 않는다 —
 * 막으면 그 기록은 날짜·메모도 못 고치고 삭제만 남는다.
 */
export function canSubmitGrowth(input: {
  height: string
  weight: string
  hasHiddenMeasurement?: boolean
}): boolean {
  if (input.hasHiddenMeasurement) return true
  return input.height.trim() !== '' || input.weight.trim() !== ''
}
