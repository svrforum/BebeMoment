import { describe, expect, it } from 'vitest'
import { type FullscreenBackState, reduceFullscreenChange, reducePopState } from './fullscreen-back'

const fresh = (): FullscreenBackState => ({ pushed: false })

describe('fullscreen back guard', () => {
  it('전체화면에 들어가면 히스토리 항목을 하나 태운다', () => {
    const s = fresh()
    expect(reduceFullscreenChange(s, true)).toBe('push')
    expect(s.pushed).toBe(true)
  })

  it('이미 태운 상태에서 중복 이벤트가 와도 또 태우지 않는다', () => {
    const s = fresh()
    reduceFullscreenChange(s, true)
    expect(reduceFullscreenChange(s, true)).toBe('none')
  })

  it('뒤로가기로 나가면 전체화면만 닫고 페이지는 그대로 둔다', () => {
    const s = fresh()
    reduceFullscreenChange(s, true)
    // 뒤로가기 → 우리가 태운 항목이 빠진다. 아직 전체화면이므로 닫아야 한다.
    expect(reducePopState(s, true)).toBe('exit')
    expect(s.pushed).toBe(false)
    // 이어서 오는 fullscreenchange(이탈)는 아무것도 하지 않아야 한다 —
    // 여기서 back 을 부르면 그때 진짜로 페이지를 떠난다(타임라인으로 튕기던 그 버그).
    expect(reduceFullscreenChange(s, false)).toBe('none')
  })

  it('컨트롤로 나가면 태워 둔 항목을 회수한다', () => {
    const s = fresh()
    reduceFullscreenChange(s, true)
    expect(reduceFullscreenChange(s, false)).toBe('back')
    expect(s.pushed).toBe(false)
    // 회수로 발생한 popstate 는 전체화면이 이미 아니고 pushed 도 내려가 있어 무시된다.
    expect(reducePopState(s, false)).toBe('none')
  })

  it('전체화면과 무관한 뒤로가기는 건드리지 않는다', () => {
    const s = fresh()
    expect(reducePopState(s, false)).toBe('none')
    expect(reducePopState(s, true)).toBe('none')
    expect(s.pushed).toBe(false)
  })

  it('전체화면을 여러 번 반복해도 항목이 쌓이지 않는다', () => {
    const s = fresh()
    for (let i = 0; i < 3; i++) {
      expect(reduceFullscreenChange(s, true)).toBe('push')
      expect(reducePopState(s, true)).toBe('exit')
      expect(reduceFullscreenChange(s, false)).toBe('none')
      expect(s.pushed).toBe(false)
    }
  })
})
