// 사용자당 동시 SSE 연결 상한 — 각 연결이 Redis 구독자를 하나 만들기에, 한 유저가
// 수백 개를 열면 Redis/연결을 고갈시킨다. 인메모리 카운터로 소프트 캡(프로세스 단위).
const MAX_PER_USER = Number(process.env.SSE_MAX_PER_USER ?? 5)
const counts = new Map<string, number>()

/** 한 자리 확보. 상한 초과면 false(호출부가 429). 성공하면 releaseSse 로 반드시 반납. */
export function acquireSse(userId: string): boolean {
  const cur = counts.get(userId) ?? 0
  if (cur >= MAX_PER_USER) return false
  counts.set(userId, cur + 1)
  return true
}

export function releaseSse(userId: string): void {
  const n = (counts.get(userId) ?? 1) - 1
  if (n <= 0) counts.delete(userId)
  else counts.set(userId, n)
}
