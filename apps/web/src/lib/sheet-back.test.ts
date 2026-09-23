import { describe, expect, it } from 'vitest'
import { type SheetBackState, reduceSheetOpenChange, reduceSheetPopState } from './sheet-back'

const fresh = (): SheetBackState => ({ pushed: false, length: 0, href: '', navigating: false })

describe('시트와 뒤로가기', () => {
  it('열리면 히스토리 항목을 하나 태운다(한 번만)', () => {
    const s = fresh()
    expect(reduceSheetOpenChange(s, true, { length: 3, href: '/a' })).toBe('push')
    expect(reduceSheetOpenChange(s, true, { length: 4, href: '/a' })).toBe('none')
  })

  it('뒤로가기는 페이지를 떠나는 대신 시트를 닫는다', () => {
    const s = fresh()
    reduceSheetOpenChange(s, true, { length: 3, href: '/a' })
    expect(reduceSheetPopState(s, true)).toBe('close')
    // 이어서 오는 닫힘 반응은 태운 항목을 또 회수하지 않는다 — 그러면 진짜로 페이지를 떠난다.
    expect(reduceSheetOpenChange(s, false, { length: 3, href: '/a' })).toBe('none')
  })

  it('버튼이나 바깥 탭으로 닫으면 태운 항목을 회수한다', () => {
    const s = fresh()
    reduceSheetOpenChange(s, true, { length: 3, href: '/a' })
    s.length = 4 // 훅이 pushState 직후의 길이를 기록한다
    expect(reduceSheetOpenChange(s, false, { length: 4, href: '/a' })).toBe('back')
  })

  it('시트 안의 링크로 이동하며 닫히면 회수하지 않는다 — 방금 한 이동이 취소된다', () => {
    const s = fresh()
    reduceSheetOpenChange(s, true, { length: 3, href: '/calendar' })
    s.length = 4
    expect(reduceSheetOpenChange(s, false, { length: 5, href: '/timeline?date=2026-09-23' })).toBe(
      'none',
    )
  })

  it('태운 적 없으면 뒤로가기에 끼어들지 않는다', () => {
    expect(reduceSheetPopState(fresh(), false)).toBe('none')
    expect(reduceSheetOpenChange(fresh(), false, { length: 3, href: '/a' })).toBe('none')
  })

  it('시트 안 링크를 누르면 이동이 아직 히스토리에 쌓이기 전에 닫혀도 회수하지 않는다', () => {
    // 라우터는 페이지를 받아 온 뒤에야 항목을 쌓는다 — 닫히는 순간엔 길이도 주소도 그대로라
    // 길이·주소만 보면 회수하게 되고, 그 뒤로가기가 막 시작된 이동을 취소했다(라이브 확인 중 발견).
    const s = fresh()
    reduceSheetOpenChange(s, true, { length: 3, href: '/calendar' })
    s.length = 4
    s.navigating = true
    expect(reduceSheetOpenChange(s, false, { length: 4, href: '/calendar' })).toBe('none')
    // 다음에 열 때는 다시 평소대로.
    expect(reduceSheetOpenChange(s, true, { length: 5, href: '/calendar' })).toBe('push')
    expect(s.navigating).toBe(false)
  })
})
