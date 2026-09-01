/**
 * `movingKey` 를 `targetKey` 자리로 옮긴 새 순서.
 *
 * 가로 드래그 스트립은 화면에 보이는 범위 안에서만 옮길 수 있다 — 사진이 많아지면 12번째를
 * 1번(대표)으로 가져오는 게 아예 불가능했다. 드래그 중에는 스트립을 스크롤할 수도 없다.
 * 그래서 "집어서 → 스크롤해서 → 놓을 자리를 탭" 하는 방식이 필요하고, 그 자리 계산이 이것.
 *
 * 대상 자리에 **끼워 넣는다**(swap 이 아니다). 대표를 바꾸려고 12번째를 1번으로 가져올 때
 * 1번이 12번으로 날아가면 안 되고, 한 칸씩 밀리는 게 사용자가 기대하는 결과다.
 */
export function moveKey(keys: readonly string[], movingKey: string, targetKey: string): string[] {
  const from = keys.indexOf(movingKey)
  const to = keys.indexOf(targetKey)
  if (from < 0 || to < 0 || from === to) return [...keys]
  const next = [...keys]
  next.splice(from, 1)
  next.splice(to, 0, movingKey)
  return next
}
