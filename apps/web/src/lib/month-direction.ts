/** 연·월(0-based)을 한 줄의 수로 — 해가 바뀌는 경계에서도 크기 비교가 맞다. */
export function monthIndex(year: number, month0: number): number {
  return year * 12 + month0
}

/** 달이 넘어가는 방향. 다음 달이면 오른쪽에서 들어오고(1), 이전 달이면 왼쪽에서(-1). */
export function monthDirection(from: number, to: number): -1 | 0 | 1 {
  return to > from ? 1 : to < from ? -1 : 0
}
