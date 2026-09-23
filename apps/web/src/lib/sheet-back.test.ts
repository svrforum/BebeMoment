import { describe, expect, it } from 'vitest'
import { type SheetHistory, sheetClosed, sheetOpened, sheetPopState } from './sheet-back'

const fresh = (): SheetHistory => ({ entry: 'none', href: '', open: 0 })

describe('시트와 뒤로가기', () => {
  it('열리면 히스토리 항목을 하나 태운다', () => {
    const s = fresh()
    expect(sheetOpened(s, '/a')).toBe('push')
  })

  it('뒤로가기는 페이지를 떠나는 대신 열린 시트를 닫는다', () => {
    const s = fresh()
    sheetOpened(s, '/a')
    expect(sheetPopState(s, '/a')).toBe('close-all')
    // 이미 항목을 소비했으니 뒤따르는 닫힘은 아무것도 남기지 않는다.
    sheetClosed(s)
    expect(sheetPopState(s, '/a')).toBe('none')
  })

  it('버튼으로 닫으면 히스토리를 건드리지 않고, 다음 뒤로가기가 남은 항목을 한 칸 건너뛴다', () => {
    const s = fresh()
    sheetOpened(s, '/a')
    sheetClosed(s)
    // 같은 페이지의 사본 항목에서 빠져나온 참이다 — 한 번 더 뒤로가 누른 횟수만큼만 움직이게.
    expect(sheetPopState(s, '/a')).toBe('skip')
    expect(sheetPopState(s, '/a')).toBe('none')
  })

  it('시트가 닫히며 곧바로 다음 시트가 열리면 항목을 이어받는다 — 히스토리를 또 쌓지 않는다', () => {
    // 추가 선택 시트 → 업로드 시트. 닫힘 때 뒤로가기로 회수하면 그 뒤로가기가 업로드 시트의
    // 항목을 빼서 업로드 시트가 열리자마자 닫혔다(e2e 에서 발견).
    const s = fresh()
    sheetOpened(s, '/timeline')
    sheetClosed(s)
    expect(sheetOpened(s, '/timeline')).toBe('none')
    expect(sheetPopState(s, '/timeline')).toBe('close-all')
  })

  it('닫으며 다른 페이지로 갔다가 돌아오면 남은 사본 항목을 건너뛰어 한 번에 한 칸씩 간다', () => {
    const s = fresh()
    sheetOpened(s, '/calendar')
    sheetClosed(s) // 시트 안 링크 → /timeline?date=…
    // /timeline 에서 뒤로 → 캘린더 사본 항목에 도착(같은 캘린더) → 한 칸 더 가서 진짜 캘린더로.
    expect(sheetPopState(s, '/calendar')).toBe('skip')
  })

  it('다른 페이지에서 남은 항목과 상관없는 뒤로가기엔 끼어들지 않고 추적을 내려놓는다', () => {
    const s = fresh()
    sheetOpened(s, '/calendar')
    sheetClosed(s)
    expect(sheetPopState(s, '/timeline')).toBe('none')
    expect(s.entry).toBe('none')
  })

  it('남은 항목이 다른 페이지 것이면 이어받지 않고 새로 태운다', () => {
    const s = fresh()
    sheetOpened(s, '/calendar')
    sheetClosed(s)
    expect(sheetOpened(s, '/timeline')).toBe('push')
  })
})
