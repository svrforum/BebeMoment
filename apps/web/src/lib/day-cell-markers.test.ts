import { describe, expect, it } from 'vitest'
import { dayCellMarkers } from './day-cell-markers'

describe('dayCellMarkers', () => {
  it('스토리도 일정도 없으면 아무것도 그리지 않는다', () => {
    expect(dayCellMarkers({ hasStory: false, scheduleTotal: 0, scheduleRemaining: 0 })).toEqual([])
  })

  it('스토리만 있으면 스토리 표식 하나', () => {
    expect(dayCellMarkers({ hasStory: true, scheduleTotal: 0, scheduleRemaining: 0 })).toEqual([
      { kind: 'story' },
    ])
  })

  it('일정 1건은 개수 없는 점이다', () => {
    expect(dayCellMarkers({ hasStory: false, scheduleTotal: 1, scheduleRemaining: 1 })).toEqual([
      { kind: 'schedule', count: 1, showCount: false, active: true },
    ])
  })

  it('여러 건이면 개수를 적고, 전부 끝냈으면 흐린 표식이다', () => {
    expect(dayCellMarkers({ hasStory: false, scheduleTotal: 3, scheduleRemaining: 0 })).toEqual([
      { kind: 'schedule', count: 3, showCount: true, active: false },
    ])
  })

  it('둘 다 있으면 스토리가 먼저다 — 넓어질 수 있는 일정 배지가 끝에 붙어야 한다', () => {
    expect(dayCellMarkers({ hasStory: true, scheduleTotal: 2, scheduleRemaining: 1 })).toEqual([
      { kind: 'story' },
      { kind: 'schedule', count: 2, showCount: true, active: true },
    ])
  })

  it('일정 수가 0 이하면 일정 표식은 없다', () => {
    expect(dayCellMarkers({ hasStory: false, scheduleTotal: -1, scheduleRemaining: 0 })).toEqual([])
  })
})
