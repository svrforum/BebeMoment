import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createScheduleEntry } from './entry'
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

async function addViewer(familyId: string, tag: string) {
  const { user } = await signup(
    {
      email: `${tag}-${Date.now()}-${Math.random()}@b.com`,
      password: 'password123',
      displayName: 'V',
    },
    db.prismaPublic,
  )
  await db.prismaPublic.membership.create({ data: { familyId, userId: user.id, role: 'family' } })
  return user
}

describe('setScheduleReminders', () => {
  it('알림 집합을 통째로 교체한다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: 'x',
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
        specs: [
          { kind: 'lead', leadMinutes: 30 },
          { kind: 'lead', leadMinutes: 1440 },
        ],
      },
      db.prismaPublic,
    )
    const after = await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'lead', leadMinutes: 60 }],
      },
      db.prismaPublic,
    )
    expect(after).toHaveLength(1)
    expect(after[0]?.leadMinutes).toBe(60)
    const count = await db.prismaPublic.scheduleReminder.count({
      where: { familyId: family.id, entryId: entry.id },
    })
    expect(count).toBe(1)
  })

  it('같은 알림을 두 번 주면 하나만 남는다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: 'x',
        onDate: '2026-09-24',
        startMinute: 600,
      },
      db.prismaPublic,
    )
    const out = await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [
          { kind: 'lead', leadMinutes: 30 },
          { kind: 'lead', leadMinutes: 30 },
        ],
      },
      db.prismaPublic,
    )
    expect(out).toHaveLength(1)
  })

  it('하루 전 알림도 저장한다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    const out = await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'dayBefore', daysBefore: 1, atMinute: 540 }],
      },
      db.prismaPublic,
    )
    expect(out).toHaveLength(1)
    expect(out[0]?.daysBefore).toBe(1)
    expect(out[0]?.atMinute).toBe(540)
    expect(out[0]?.leadMinutes).toBeNull()
  })

  it('알림을 지우면 발송 원장도 함께 사라진다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: 'x',
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
    await db.prismaPublic.scheduleReminderFire.create({
      data: {
        reminderId: reminder?.id ?? '',
        occurrenceOn: new Date('2026-09-24T00:00:00.000Z'),
        familyId: family.id,
        state: 'sent',
      },
    })
    await setScheduleReminders(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, specs: [] },
      db.prismaPublic,
    )
    const fires = await db.prismaPublic.scheduleReminderFire.count({
      where: { familyId: family.id },
    })
    expect(fires).toBe(0)
  })

  it('일정 수정 권한이 없으면 거절한다', async () => {
    const { user, family } = await setup()
    const viewer = await addViewer(family.id, 'v')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await expect(
      setScheduleReminders(
        {
          entryId: entry.id,
          familyId: family.id,
          byUserId: viewer.id,
          specs: [{ kind: 'lead', leadMinutes: 30 }],
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('다른 가족의 일정에는 알림을 걸 수 없다', async () => {
    const { user, family } = await setup('A')
    const other = await setup('B')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await expect(
      setScheduleReminders(
        {
          entryId: entry.id,
          familyId: other.family.id,
          byUserId: other.user.id,
          specs: [{ kind: 'lead', leadMinutes: 30 }],
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('범위를 벗어난 알림은 거절한다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await expect(
      setScheduleReminders(
        {
          entryId: entry.id,
          familyId: family.id,
          byUserId: user.id,
          specs: [{ kind: 'dayBefore', daysBefore: 60, atMinute: 540 }],
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })
})
