import { describe, expect, it } from 'vitest'
import { isNavActive } from './nav-active'

describe('isNavActive', () => {
  it('같은 경로면 켠다', () => {
    expect(isNavActive('/calendar', '/calendar')).toBe(true)
  })

  /** 할 일 탭은 캘린더의 하위 경로다 — 여기서 캘린더 탭이 꺼지면 어디에 있는지 알 수 없다. */
  it('하위 경로에서도 켠 채로 둔다', () => {
    expect(isNavActive('/calendar/todo', '/calendar')).toBe(true)
    expect(isNavActive('/settings/notifications', '/settings')).toBe(true)
  })

  it('접두사만 같은 다른 경로는 켜지 않는다', () => {
    expect(isNavActive('/calendars', '/calendar')).toBe(false)
    expect(isNavActive('/timeline', '/calendar')).toBe(false)
    expect(isNavActive(null, '/calendar')).toBe(false)
  })

  /** 캘린더에서 날짜를 눌러 들어간 `/timeline?date=` 는 캘린더 맥락이다(기존 예외). */
  it('날짜 보기에서는 캘린더만 켠다', () => {
    expect(isNavActive('/timeline', '/calendar', { inDateView: true })).toBe(true)
    expect(isNavActive('/timeline', '/timeline', { inDateView: true })).toBe(false)
  })

  /** 일정 상세(`/schedule/<id>`)는 캘린더에서 들어가는 화면이다 — 탭이 꺼지면 어디에 있는지 모른다. */
  it('일정 상세에서는 캘린더만 켠다', () => {
    const id = '/schedule/0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
    expect(isNavActive(id, '/calendar')).toBe(true)
    expect(isNavActive(id, '/timeline')).toBe(false)
    expect(isNavActive(id, '/settings')).toBe(false)
    expect(isNavActive('/schedule', '/calendar')).toBe(true)
  })

  it('접두사만 같은 `/schedules` 는 캘린더 맥락이 아니다', () => {
    expect(isNavActive('/schedules', '/calendar')).toBe(false)
  })
})
