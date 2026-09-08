import { describe, expect, it } from 'vitest'
import {
  SSE_MAX_CONSECUTIVE_FAILURES,
  reconnectDelayMs,
  shouldStopReconnecting,
} from './sse-backoff'

describe('SSE 재연결 백오프', () => {
  it('5초에서 시작해 두 배씩 늘고 60초에서 멈춘다', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map(reconnectDelayMs)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ])
  })

  it('0·음수 실패 횟수는 첫 지연으로 취급한다', () => {
    expect(reconnectDelayMs(0)).toBe(5_000)
    expect(reconnectDelayMs(-3)).toBe(5_000)
  })

  it('연속 실패가 상한에 닿으면 포기한다(401 무한루프 방지)', () => {
    expect(shouldStopReconnecting(SSE_MAX_CONSECUTIVE_FAILURES - 1)).toBe(false)
    expect(shouldStopReconnecting(SSE_MAX_CONSECUTIVE_FAILURES)).toBe(true)
  })
})
