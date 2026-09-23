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
  ] as const)('%s이 바뀌면 바뀐 것이다', (_label, patch) => {
    expect(scheduleContentChanged(base, { ...base, ...patch })).toBe(true)
  })

  it('아기 연결만 달라진 것은 바뀐 것으로 보지 않는다', () => {
    // 아기가 한 명이면 폼이 저장할 때 그 아기로 자동 연결한다 — 연결 전에 만든 일정을 열었다
    // 그냥 저장하기만 해도 값이 달라진다. 사용자가 바꾼 게 아니다(라이브 확인 중 발견).
    expect(scheduleContentChanged({ ...base, babyId: null }, { ...base, babyId: 'b1' })).toBe(false)
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
