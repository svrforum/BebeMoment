export const SSE_RECONNECT_BASE_MS = 5_000
export const SSE_RECONNECT_MAX_MS = 60_000
// 세션이 만료되면 매번 401 이라 영원히 다시 붙으려 든다 — 이만큼 연속 실패하면 멈춘다.
export const SSE_MAX_CONSECUTIVE_FAILURES = 10

/** n 번째(1부터) 연속 실패 뒤 기다릴 시간 — 5s → 10s → 20s → 40s → 60s(상한). */
export function reconnectDelayMs(consecutiveFailures: number): number {
  const exp = Math.max(0, consecutiveFailures - 1)
  return Math.min(SSE_RECONNECT_BASE_MS * 2 ** exp, SSE_RECONNECT_MAX_MS)
}

export function shouldStopReconnecting(consecutiveFailures: number): boolean {
  return consecutiveFailures >= SSE_MAX_CONSECUTIVE_FAILURES
}
