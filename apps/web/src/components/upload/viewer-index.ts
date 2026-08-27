/** 미리보기 뷰어에서 한 장을 지운 뒤 머무를 슬롯. `remaining` 은 지운 **뒤**의 장수.
 *  같은 자리를 유지해 다음 사진이 들어오게 하고, 마지막 장을 지웠으면 한 칸 물러난다.
 *  null = 남은 게 없어 뷰어를 닫아야 함. */
export function nextViewerIndex(remaining: number, removedIndex: number): number | null {
  if (remaining <= 0) return null
  if (removedIndex >= remaining) return remaining - 1
  return removedIndex < 0 ? 0 : removedIndex
}
