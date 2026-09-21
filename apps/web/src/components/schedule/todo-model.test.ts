import { describe, expect, it } from 'vitest'
import type { ScheduleEntryView } from '@/server/schedule/list'
import {
  type TodoGroups,
  applyDone,
  buildTodoItems,
  groupTodoItems,
  openGroupOf,
} from './todo-model'

function entry(id: string, onDate: string | null, doneAt: Date | null = null): ScheduleEntryView {
  return {
    id,
    title: id,
    onDate,
    startMinute: null,
    doneAt,
    checklistTotal: 0,
    checklistDone: 0,
    reminderCount: 0,
  }
}

const TODAY = '2026-09-22'

const groups: TodoGroups = {
  overdue: [entry('late', '2026-09-01')],
  today: [entry('t1', TODAY), entry('t2', TODAY), entry('t3', TODAY)],
  upcoming: [entry('soon', '2026-10-05')],
  undated: [entry('u1', null), entry('u2', null)],
  done: [entry('old', '2026-08-01', new Date('2026-08-02T00:00:00.000Z'))],
}

describe('openGroupOf', () => {
  it('날짜로 지난 · 오늘 · 예정 · 날짜 없음을 가른다', () => {
    expect(openGroupOf(entry('a', '2026-09-21'), TODAY)).toBe('overdue')
    expect(openGroupOf(entry('a', TODAY), TODAY)).toBe('today')
    expect(openGroupOf(entry('a', '2026-09-23'), TODAY)).toBe('upcoming')
    expect(openGroupOf(entry('a', null), TODAY)).toBe('undated')
  })
})

describe('todo 묶음 왕복', () => {
  it('펼쳤다 다시 묶으면 서버가 준 묶음 그대로다', () => {
    expect(groupTodoItems(buildTodoItems(groups, TODAY))).toEqual(groups)
  })
})

describe('applyDone', () => {
  const at = new Date('2026-09-22T10:00:00.000Z')

  it('완료로 바꾸면 완료 묶음으로 옮긴다', () => {
    const next = groupTodoItems(applyDone(buildTodoItems(groups, TODAY), 't2', at))
    expect(next.today.map((e) => e.id)).toEqual(['t1', 't3'])
    expect(next.done.map((e) => e.id)).toEqual(['t2', 'old'])
    expect(next.done[0]?.doneAt).toEqual(at)
  })

  /**
   * 저장이 실패하면 원래 `doneAt` 을 다시 넣어 되돌린다 — 되돌린 결과가 원래와 한 글자라도
   * 다르면 화면에는 "완료" 인데 다른 기기엔 기록이 없는 거짓말이 남는다.
   */
  it('되돌리면 원래 자리로 정확히 돌아온다', () => {
    const items = buildTodoItems(groups, TODAY)
    const reverted = applyDone(applyDone(items, 't2', at), 't2', null)
    expect(groupTodoItems(reverted)).toEqual(groups)
  })

  it('이미 완료된 항목을 되돌리면 날짜에 맞는 묶음으로 간다', () => {
    const next = groupTodoItems(applyDone(buildTodoItems(groups, TODAY), 'old', null))
    expect(next.done).toEqual([])
    expect(next.overdue.map((e) => e.id)).toEqual(['late', 'old'])
  })

  it('없는 id 면 아무것도 바꾸지 않는다', () => {
    const items = buildTodoItems(groups, TODAY)
    expect(applyDone(items, 'nope', at)).toBe(items)
  })
})
