import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { claimReminderFire, findDueReminders } from './due'
import { createScheduleEntry, deleteScheduleEntry, setScheduleEntryDone } from './entry'
import { setScheduleReminders } from './reminders'

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

async function setup(name = 'F') {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name, userId: user.id }, db.prismaPublic)
  return { user, family }
}

/** 시각 일정 하나 + 시작 30분 전 알림 하나. 알림 시각은 2026-09-24 09:30(인스턴스 시간대). */
async function timedSetup() {
  const { user, family } = await setup()
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
  const [reminder] = await setScheduleReminders(
    {
      entryId: entry.id,
      familyId: family.id,
      byUserId: user.id,
      specs: [{ kind: 'lead', leadMinutes: 30 }],
    },
    db.prismaPublic,
  )
  return { user, family, entry, reminder: reminder! }
}

describe('findDueReminders', () => {
  it('구간 안에 든 알림을 찾는다', async () => {
    const { entry, reminder } = await timedSetup()
    const { due } = await findDueReminders(new Date(2026, 8, 24, 9, 31), db.prismaPublic)
    expect(due).toHaveLength(1)
    expect(due[0]?.occurrenceOn).toBe('2026-09-24')
    expect(due[0]?.title).toBe('접종')
    expect(due[0]?.entryId).toBe(entry.id)
    expect(due[0]?.reminderId).toBe(reminder.id)
  })

  it('아직 시각이 안 됐으면 찾지 않는다', async () => {
    await timedSetup()
    const { due, skipped } = await findDueReminders(new Date(2026, 8, 24, 9, 29), db.prismaPublic)
    expect(due).toHaveLength(0)
    expect(skipped).toHaveLength(0)
  })

  it('구간(60분)보다 오래 지났으면 보내지 않고 건너뜀으로 표시한다', async () => {
    await timedSetup()
    const { due, skipped } = await findDueReminders(new Date(2026, 8, 24, 11, 0), db.prismaPublic)
    expect(due).toHaveLength(0)
    expect(skipped).toHaveLength(1)
  })

  it('24시간보다 오래 지났으면 기록조차 하지 않는다', async () => {
    await timedSetup()
    const { due, skipped } = await findDueReminders(new Date(2026, 8, 26, 9, 30), db.prismaPublic)
    expect(due).toHaveLength(0)
    expect(skipped).toHaveLength(0)
  })

  it('완료된 일정은 알리지 않는다', async () => {
    const { user, family, entry } = await timedSetup()
    await setScheduleEntryDone(
      { id: entry.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    const { due } = await findDueReminders(new Date(2026, 8, 24, 9, 31), db.prismaPublic)
    expect(due).toHaveLength(0)
  })

  it('삭제된 일정은 알리지 않는다', async () => {
    const { user, family, entry } = await timedSetup()
    await deleteScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const { due } = await findDueReminders(new Date(2026, 8, 24, 9, 31), db.prismaPublic)
    expect(due).toHaveLength(0)
  })

  it('매년 반복은 올해 회차를 찾는다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '생일',
        onDate: '2020-03-05',
        repeatYearly: true,
      },
      db.prismaPublic,
    )
    await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'dayBefore', daysBefore: 0, atMinute: 540 }],
      },
      db.prismaPublic,
    )
    const { due } = await findDueReminders(new Date(2026, 2, 5, 9, 1), db.prismaPublic)
    expect(due).toHaveLength(1)
    expect(due[0]?.occurrenceOn).toBe('2026-03-05')
  })

  it('다른 가족의 일정도 함께 찾는다', async () => {
    await timedSetup()
    await timedSetup()
    const { due } = await findDueReminders(new Date(2026, 8, 24, 9, 31), db.prismaPublic)
    expect(due).toHaveLength(2)
    expect(new Set(due.map((d) => d.familyId)).size).toBe(2)
  })
})

describe('claimReminderFire', () => {
  it('원장 선점은 한 번만 성공한다', async () => {
    await timedSetup()
    const { due } = await findDueReminders(new Date(2026, 8, 24, 9, 31), db.prismaPublic)
    const target = due[0]!
    expect(await claimReminderFire(target, 'sent', db.prismaPublic)).toBe(true)
    expect(await claimReminderFire(target, 'sent', db.prismaPublic)).toBe(false)
  })

  it('이미 보낸 회차는 다시 찾지 않는다', async () => {
    await timedSetup()
    const now = new Date(2026, 8, 24, 9, 31)
    const first = await findDueReminders(now, db.prismaPublic)
    await claimReminderFire(first.due[0]!, 'sent', db.prismaPublic)
    const second = await findDueReminders(now, db.prismaPublic)
    expect(second.due).toHaveLength(0)
  })

  it('건너뜀으로 기록한 회차도 다시 찾지 않는다', async () => {
    await timedSetup()
    const now = new Date(2026, 8, 24, 11, 0)
    const first = await findDueReminders(now, db.prismaPublic)
    expect(await claimReminderFire(first.skipped[0]!, 'skipped_past', db.prismaPublic)).toBe(true)
    const second = await findDueReminders(now, db.prismaPublic)
    expect(second.skipped).toHaveLength(0)
  })
})
