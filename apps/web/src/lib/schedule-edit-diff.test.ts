import { describe, expect, it } from 'vitest'
import { type ScheduleContent, scheduleContentChanged } from './schedule-edit-diff'

const base: ScheduleContent = {
  title: '강남 진료',
  memo: '결과서',
  onDate: '2026-09-25',
  startMinute: 600,
  repeatYearly: false,
  repeatUntil: null,
  babyId: 'b1',
  checklist: ['분유', '기저귀'],
}

describe('scheduleContentChanged', () => {
  it('아무것도 안 바꾸고 저장하면 바뀐 게 없다', () => {
    expect(scheduleContentChanged(base, { ...base, checklist: [...base.checklist] })).toBe(false)
  })

  it('앞뒤 공백과 빈 메모(null·빈 문자열)의 차이는 바뀐 것으로 보지 않는다', () => {
    expect(scheduleContentChanged({ ...base, memo: null }, { ...base, memo: '' })).toBe(false)
    expect(scheduleContentChanged(base, { ...base, title: ' 강남 진료 ' })).toBe(false)
  })

  it.each([
    ['제목', { title: '신촌 진료' }],
    ['메모', { memo: '결과서, 수첩' }],
    ['날짜', { onDate: '2026-09-26' }],
    ['시각', { startMinute: 630 }],
    ['종일로', { startMinute: null }],
    ['반복', { repeatYearly: true }],
    ['아기', { babyId: null }],
  ] as const)('%s이 바뀌면 바뀐 것이다', (_label, patch) => {
    expect(scheduleContentChanged(base, { ...base, ...patch })).toBe(true)
  })

  it('체크리스트 항목을 더하거나 빼거나 이름을 바꾸거나 순서를 바꾸면 바뀐 것이다', () => {
    expect(scheduleContentChanged(base, { ...base, checklist: ['분유', '기저귀', '물티슈'] })).toBe(
      true,
    )
    expect(scheduleContentChanged(base, { ...base, checklist: ['분유'] })).toBe(true)
    expect(scheduleContentChanged(base, { ...base, checklist: ['분유', '기저귀 2팩'] })).toBe(true)
    expect(scheduleContentChanged(base, { ...base, checklist: ['기저귀', '분유'] })).toBe(true)
  })
})
