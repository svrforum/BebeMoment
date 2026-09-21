import type { ScheduleEntryView } from '@/server/schedule/list'

export type TodoGroups = {
  overdue: ScheduleEntryView[]
  today: ScheduleEntryView[]
  upcoming: ScheduleEntryView[]
  undated: ScheduleEntryView[]
  done: ScheduleEntryView[]
}

export type TodoGroupKey = keyof TodoGroups

/** 지난 것부터 본다. 완료는 맨 아래에 접어 둔다. */
export const TODO_GROUP_ORDER = ['overdue', 'today', 'upcoming', 'undated', 'done'] as const

export type OpenGroupKey = Exclude<TodoGroupKey, 'done'>

export type TodoItem = {
  entry: ScheduleEntryView
  /** 완료를 되돌렸을 때 돌아갈 자리. 서버가 놓아 준 순서를 그대로 쓴다. */
  home: OpenGroupKey
}

export function openGroupOf(entry: ScheduleEntryView, todayKey: string): OpenGroupKey {
  if (entry.onDate === null) return 'undated'
  if (entry.onDate < todayKey) return 'overdue'
  if (entry.onDate === todayKey) return 'today'
  return 'upcoming'
}

/**
 * 서버가 준 묶음을 한 줄로 편다. 각 항목은 자기 자리(`home`)를 들고 다니므로, 완료를
 * 되돌릴 때 날짜로 자리를 다시 추측하지 않아도 된다.
 */
export function buildTodoItems(groups: TodoGroups, todayKey: string): TodoItem[] {
  return TODO_GROUP_ORDER.flatMap((key) =>
    groups[key].map((entry) => ({
      entry,
      home: key === 'done' ? openGroupOf(entry, todayKey) : key,
    })),
  )
}

export function groupTodoItems(items: TodoItem[]): TodoGroups {
  const groups: TodoGroups = { overdue: [], today: [], upcoming: [], undated: [], done: [] }
  for (const item of items) {
    groups[item.entry.doneAt ? 'done' : item.home].push(item.entry)
  }
  return groups
}

/**
 * 완료 토글의 낙관적 반영. 저장이 실패하면 **원래 `doneAt` 을 그대로 다시 넣어 되돌린다** —
 * 낙관적 상태를 그대로 두면 한쪽 화면엔 "완료" 인데 다른 기기엔 기록이 없다.
 */
export function applyDone(items: TodoItem[], id: string, doneAt: Date | null): TodoItem[] {
  if (!items.some((item) => item.entry.id === id)) return items
  return items.map((item) =>
    item.entry.id === id ? { ...item, entry: { ...item.entry, doneAt } } : item,
  )
}
