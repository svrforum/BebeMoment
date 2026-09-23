import { type ScheduleContent, scheduleContentChanged } from '@/lib/schedule-edit-diff'
import { type EnqueueNotification, enqueueNotification } from '../notifications/enqueue'

/**
 * 일정을 고친 뒤 다른 보호자에게 알릴지 정하고 보낸다. 부르는 쪽은 **저장이 모두 끝난 뒤**
 * 한 번만 부른다 — 수정은 일정·체크리스트·알림 세 번의 쓰기라, 중간에 실패했는데 "바뀌었어요"
 * 가 먼저 가면 안 된다. 보냈으면 true.
 */
export async function notifyScheduleUpdated(
  input: {
    familyId: string
    byUserId: string
    entryId: string
    before: ScheduleContent
    after: ScheduleContent
  },
  enqueue: EnqueueNotification = enqueueNotification,
): Promise<boolean> {
  if (!scheduleContentChanged(input.before, input.after)) return false
  const { after } = input
  await enqueue({
    familyId: input.familyId,
    actorUserId: input.byUserId,
    type: 'schedule.updated',
    payload: {
      entryId: input.entryId,
      title: after.title.trim(),
      // 추가 알림과 같은 모양 — 벽시계 문자열과 분을 그대로 싣는다(§2.5).
      ...(after.onDate ? { onDate: after.onDate } : {}),
      ...(after.onDate && after.startMinute != null
        ? { startMinute: String(after.startMinute) }
        : {}),
    },
  })
  return true
}
