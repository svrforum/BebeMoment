import { describe, expect, it } from 'vitest'
import { hourInQuietWindow } from './quiet-window'

describe('hourInQuietWindow', () => {
  it('낮 시간대 창(9~18)', () => {
    expect(hourInQuietWindow(9, 9, 18)).toBe(true)
    expect(hourInQuietWindow(17, 9, 18)).toBe(true)
    expect(hourInQuietWindow(18, 9, 18)).toBe(false) // 끝은 미포함
    expect(hourInQuietWindow(8, 9, 18)).toBe(false)
  })

  // 실제 기본값이 이 모양이다(밤 10시~아침 7시) — 자정을 넘는 창을 잘못 다루면
  // 새벽 시간이 조용한 시간이 아닌 것으로 계산돼 가드가 헛돈다.
  it('자정을 넘는 창(22~7)', () => {
    expect(hourInQuietWindow(23, 22, 7)).toBe(true)
    expect(hourInQuietWindow(3, 22, 7)).toBe(true)
    expect(hourInQuietWindow(7, 22, 7)).toBe(false)
    expect(hourInQuietWindow(12, 22, 7)).toBe(false)
  })

  it('시작과 끝이 같으면 아무 시각도 안 걸린다', () => {
    for (const h of [0, 6, 12, 23]) expect(hourInQuietWindow(h, 9, 9)).toBe(false)
  })
})
