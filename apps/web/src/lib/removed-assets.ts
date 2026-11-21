/**
 * 이 문서에서 지운 사진의 id. 뒤로가기로 돌아온 타임라인은 떠날 때 기억해 둔 목록을 되살리는데
 * (`components/timeline/resume.ts`) 그 목록은 지우기 전 것이라, 여기 적힌 사진을 걸러 내야 뷰어에서
 * 지운 사진이 다시 보이지 않는다. 새로고침하면 서버 목록으로 시작하므로 비울 필요가 없다.
 */
const removed = new Set<string>()

export function forgetRemovedAssets(ids: Iterable<string>): void {
  for (const id of ids) removed.add(id)
}

export function removedAssets(): ReadonlySet<string> {
  return removed
}
