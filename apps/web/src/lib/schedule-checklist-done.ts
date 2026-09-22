/**
 * 체크 상태와 "누가 챙겼는지"는 한 쌍이다. 낙관적 갱신에서 둘이 어긋나면 체크를 푼 항목에
 * 남의 이름이 남고, 그 화면만 보는 사람에게는 그게 사실이 된다.
 */
export type ChecklistDoneState = { doneAt: Date | null; doneByName: string | null }

export function nextChecklistDone(
  item: { doneAt: Date | null },
  now: Date,
  viewerName: string | null,
): ChecklistDoneState {
  return item.doneAt ? { doneAt: null, doneByName: null } : { doneAt: now, doneByName: viewerName }
}

/** 완료된 항목에만 이름을 붙인다 — 완료가 아니면 이름이 남아 있어도 보여주지 않는다. */
export function checklistDoneCredit(item: {
  doneAt: Date | null
  doneByName: string | null
}): string | null {
  if (!item.doneAt) return null
  const name = item.doneByName?.trim()
  return name ? name : null
}
