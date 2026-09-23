/**
 * 다른 보호자에게 "일정이 바뀌었어요" 를 보낼지 가르는 비교 대상. 알림 시점(리마인더)은
 * 넣지 않는다 — 화면에 보이는 일정 내용은 그대로인데 변경 알림이 오면 무엇이 바뀌었는지
 * 찾을 수가 없다. 체크 표시(완료)도 여기서는 보지 않는다 — 그건 '수정' 이 아니다.
 */
export type ScheduleContent = {
  title: string
  memo: string | null
  onDate: string | null
  startMinute: number | null
  repeatYearly: boolean
  repeatUntil: string | null
  babyId: string | null
  checklist: string[]
}

const text = (v: string | null): string => (v ?? '').trim()

export function scheduleContentChanged(before: ScheduleContent, after: ScheduleContent): boolean {
  if (text(before.title) !== text(after.title)) return true
  if (text(before.memo) !== text(after.memo)) return true
  if ((before.onDate ?? null) !== (after.onDate ?? null)) return true
  if ((before.startMinute ?? null) !== (after.startMinute ?? null)) return true
  if (before.repeatYearly !== after.repeatYearly) return true
  if ((before.repeatUntil ?? null) !== (after.repeatUntil ?? null)) return true
  if ((before.babyId ?? null) !== (after.babyId ?? null)) return true
  const a = before.checklist.map(text)
  const b = after.checklist.map(text).filter((label) => label !== '')
  return a.length !== b.length || a.some((label, i) => label !== b[i])
}
