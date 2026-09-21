/**
 * 워커 전용 — 인스턴스의 모든 가족을 훑는 `findDueReminders` 를 쓴다(due.ts 주석 참조).
 * 요청 경로에서 부르지 말 것.
 */
import type { EnqueueNotification } from '@/server/notifications/enqueue'
import { logger } from '@/lib/logger'
import type { PrismaClient } from '@bebe/db-public'
import { claimReminderFire, findDueReminders, markReminderFireFailed } from './due'

export type ReminderTickResult = { sent: number; skipped: number; failed: number }

/**
 * 한 번의 틱 — 구간에 든 알림을 보내고, 구간을 지난 회차는 보내지 않고 원장에만 남긴다.
 * 원장 선점이 발송보다 **먼저**다: 선점에 실패하면 이미 보낸 회차이므로 건너뛴다. 반대 순서면
 * 틱이 겹치거나 재시작한 사이에 같은 알림이 두 번 간다.
 *
 * ⚠️ `enqueue` 는 **실패하면 던져야 한다.** 삼키는 구현을 넘기면 큐가 죽은 동안의 알림이
 * 원장에 '보냄'으로 굳어 다시는 시도되지 않는다(`enqueueNotificationOrThrow` 를 쓸 것).
 */
export async function runReminderTick(
  now: Date,
  prisma: PrismaClient,
  enqueue: EnqueueNotification,
): Promise<ReminderTickResult> {
  const { due, skipped } = await findDueReminders(now, prisma)

  let sentCount = 0
  let failedCount = 0
  for (const r of due) {
    if (!(await claimReminderFire(r, 'sent', prisma))) continue
    try {
      await enqueue({
        familyId: r.familyId,
        // 만든 사람도 받아야 한다 — 기본 수신자 계산은 actor 를 제외하므로 비워 둔다.
        // (schedule.reminder 는 워커에서 아예 그 계산을 타지 않는다.)
        actorUserId: '',
        type: 'schedule.reminder',
        payload: { entryId: r.entryId, title: r.title, occurrenceOn: r.occurrenceOn },
      })
      sentCount += 1
    } catch (e) {
      await markReminderFireFailed(r, prisma)
      failedCount += 1
      logger.error(
        { err: e, familyId: r.familyId, entryId: r.entryId, occurrenceOn: r.occurrenceOn },
        'schedule: reminder enqueue failed — will retry on a later tick',
      )
    }
  }

  let skippedCount = 0
  for (const r of skipped) {
    if (await claimReminderFire(r, 'skipped_past', prisma)) skippedCount += 1
  }

  return { sent: sentCount, skipped: skippedCount, failed: failedCount }
}
