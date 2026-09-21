import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { NotificationJob } from '@bebe/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createScheduleEntry } from './entry'
import { setScheduleReminders } from './reminders'
import { runReminderTick } from './tick'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.scheduleReminderFire.deleteMany()
  await db.prismaPublic.scheduleReminder.deleteMany()
  await db.prismaPublic.scheduleChecklistItem.deleteMany()
  await db.prismaPublic.scheduleEntry.deleteMany()
  await db.prismaPublic.settingHistory.deleteMany()
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

/** 시각 일정 하나 + 시작 30분 전 알림 하나. 알림 시각은 2026-09-24 09:30(인스턴스 시간대). */
async function timedSetup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  const entry = await createScheduleEntry(
    {
      familyId: family.id,
      byUserId: user.id,
      title: '접종',
      onDate: '2026-09-24',
      startMinute: 600,
    },
    db.prismaPublic,
  )
  await setScheduleReminders(
    {
      entryId: entry.id,
      familyId: family.id,
      byUserId: user.id,
      specs: [{ kind: 'lead', leadMinutes: 30 }],
    },
    db.prismaPublic,
  )
  return { user, family, entry }
}

const NOW = new Date(2026, 8, 24, 9, 31)
const LATE_NOW = new Date(2026, 8, 24, 11, 0)

describe('runReminderTick', () => {
  it('보낼 알림을 큐에 넣고 원장을 남긴다', async () => {
    const { family, entry } = await timedSetup()
    const sent: NotificationJob[] = []
    const result = await runReminderTick(NOW, db.prismaPublic, async (j) => {
      sent.push(j)
    })
    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.type).toBe('schedule.reminder')
    expect(sent[0]?.familyId).toBe(family.id)
    expect(sent[0]?.actorUserId).toBe('')
    expect(sent[0]?.payload.entryId).toBe(entry.id)
    expect(sent[0]?.payload.title).toBe('접종')
    expect(sent[0]?.payload.occurrenceOn).toBe('2026-09-24')
    const row = await db.prismaPublic.scheduleReminderFire.findFirst({
      where: { familyId: family.id },
    })
    expect(row?.state).toBe('sent')
  })

  it('같은 틱을 두 번 돌려도 한 번만 보낸다', async () => {
    await timedSetup()
    const sent: NotificationJob[] = []
    const push = async (j: NotificationJob): Promise<void> => {
      sent.push(j)
    }
    await runReminderTick(NOW, db.prismaPublic, push)
    const second = await runReminderTick(NOW, db.prismaPublic, push)
    expect(sent).toHaveLength(1)
    expect(second.sent).toBe(0)
  })

  it('구간을 지난 알림은 보내지 않고 건너뜀으로 기록한다', async () => {
    const { family } = await timedSetup()
    const sent: NotificationJob[] = []
    const result = await runReminderTick(LATE_NOW, db.prismaPublic, async (j) => {
      sent.push(j)
    })
    expect(sent).toHaveLength(0)
    expect(result.skipped).toBe(1)
    const row = await db.prismaPublic.scheduleReminderFire.findFirst({
      where: { familyId: family.id },
    })
    expect(row?.state).toBe('skipped_past')
  })

  it('큐에 넣지 못하면 보냈다고 세지 않고 실패로 남긴다', async () => {
    const { family } = await timedSetup()
    const result = await runReminderTick(NOW, db.prismaPublic, async () => {
      throw new Error('redis down')
    })
    expect(result).toEqual({ sent: 0, skipped: 0, failed: 1 })
    const row = await db.prismaPublic.scheduleReminderFire.findFirst({
      where: { familyId: family.id },
    })
    expect(row?.state).toBe('failed')
  })

  it('실패한 회차는 다음 틱에서 다시 보낸다', async () => {
    const { family } = await timedSetup()
    await runReminderTick(NOW, db.prismaPublic, async () => {
      throw new Error('redis down')
    })
    const sent: NotificationJob[] = []
    const second = await runReminderTick(NOW, db.prismaPublic, async (j) => {
      sent.push(j)
    })
    expect(second.sent).toBe(1)
    expect(sent).toHaveLength(1)
    const rows = await db.prismaPublic.scheduleReminderFire.findMany({
      where: { familyId: family.id },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.state).toBe('sent')
  })

  it('알림을 바꾸지 않고 일정을 다시 저장해도 두 번 보내지 않는다', async () => {
    const { user, family, entry } = await timedSetup()
    const sent: NotificationJob[] = []
    const push = async (j: NotificationJob): Promise<void> => {
      sent.push(j)
    }
    await runReminderTick(NOW, db.prismaPublic, push)
    // 수정 시트는 알림 목록을 통째로 다시 보낸다 — 바뀐 게 없으면 발송 기록도 그대로여야 한다.
    await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'lead', leadMinutes: 30 }],
      },
      db.prismaPublic,
    )
    const second = await runReminderTick(new Date(2026, 8, 24, 9, 37), db.prismaPublic, push)
    expect(second.sent).toBe(0)
    expect(sent).toHaveLength(1)
  })

  it('보낼 것이 없으면 조용히 0을 돌려준다', async () => {
    await timedSetup()
    const sent: NotificationJob[] = []
    const result = await runReminderTick(
      new Date(2026, 8, 24, 9, 29),
      db.prismaPublic,
      async (j) => {
        sent.push(j)
      },
    )
    expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 })
    expect(sent).toHaveLength(0)
    expect(await db.prismaPublic.scheduleReminderFire.count()).toBe(0)
  })
})
