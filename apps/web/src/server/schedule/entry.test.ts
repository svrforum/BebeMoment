import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { setSetting } from '../settings/set'
import { setScheduleReminders } from './reminders'
import {
  createScheduleEntry,
  deleteScheduleEntry,
  setScheduleEntryDone,
  updateScheduleEntry,
} from './entry'

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

describe('createScheduleEntry', () => {
  it('제목과 날짜로 일정을 만든다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '예방접종',
        onDate: '2026-09-24',
        startMinute: 600,
      },
      db.prismaPublic,
    )
    expect(entry.title).toBe('예방접종')
    expect(entry.startMinute).toBe(600)
    expect(entry.doneAt).toBeNull()
  })

  it('날짜 없이 만들면 날짜 없는 할 일이 된다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '기저귀 주문' },
      db.prismaPublic,
    )
    expect(entry.onDate).toBeNull()
    expect(entry.startMinute).toBeNull()
  })

  it('제목이 비면 거절한다', async () => {
    const { user, family } = await setup()
    await expect(
      createScheduleEntry({ familyId: family.id, byUserId: user.id, title: '  ' }, db.prismaPublic),
    ).rejects.toThrow()
  })

  it('날짜 없이 시각만 주면 거절한다', async () => {
    const { user, family } = await setup()
    await expect(
      createScheduleEntry(
        { familyId: family.id, byUserId: user.id, title: 'x', startMinute: 600 },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('날짜 없이 매년 반복을 켜면 거절한다', async () => {
    const { user, family } = await setup()
    await expect(
      createScheduleEntry(
        { familyId: family.id, byUserId: user.id, title: 'x', repeatYearly: true },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('권한이 없는 family 역할은 만들 수 없다', async () => {
    const { family } = await setup()
    const { user: other } = await signup(
      { email: `o-${Date.now()}@b.com`, password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: other.id, role: 'family' },
    })
    await expect(
      createScheduleEntry(
        { familyId: family.id, byUserId: other.id, title: 'x', onDate: '2026-09-24' },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('관리자가 권한을 부여하면 family 역할도 만들 수 있다', async () => {
    const { family } = await setup()
    const { user: other } = await signup(
      { email: `o2-${Date.now()}@b.com`, password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: other.id, role: 'family' },
    })
    await setSetting('permissions.family', ['schedule.create'], null, db.prismaPublic)
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: other.id, title: 'x', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    expect(entry.id).toBeTruthy()
  })
})

describe('updateScheduleEntry', () => {
  it('제목과 메모를 고친다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    const updated = await updateScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id, patch: { title: 'b', memo: '메모' } },
      db.prismaPublic,
    )
    expect(updated.title).toBe('b')
    expect(updated.memo).toBe('메모')
  })

  it('다른 가족의 일정은 찾지 못한다', async () => {
    const { user, family } = await setup('A')
    const other = await setup('B')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await expect(
      updateScheduleEntry(
        { id: entry.id, familyId: other.family.id, byUserId: other.user.id, patch: { title: 'x' } },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('시각을 옮기면 그 일정의 발송 기록을 지운다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: 'a',
        onDate: '2026-09-24',
        startMinute: 540,
      },
      db.prismaPublic,
    )
    const [reminder] = await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'lead', leadMinutes: 0 }],
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
    // 같은 날 안에서 시간만 미뤘다 — 회차 키가 그대로라 기록을 남겨 두면 새 시각에 안 울린다.
    await updateScheduleEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { title: 'a', onDate: '2026-09-24', startMinute: 1080 },
      },
      db.prismaPublic,
    )
    expect(
      await db.prismaPublic.scheduleReminderFire.count({ where: { familyId: family.id } }),
    ).toBe(0)
    expect(await db.prismaPublic.scheduleReminder.count({ where: { familyId: family.id } })).toBe(1)
  })

  it('제목만 고치면 발송 기록은 그대로 둔다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: 'a',
        onDate: '2026-09-24',
        startMinute: 540,
      },
      db.prismaPublic,
    )
    const [reminder] = await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'lead', leadMinutes: 0 }],
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
    await updateScheduleEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { title: '2차 접종', onDate: '2026-09-24', startMinute: 540 },
      },
      db.prismaPublic,
    )
    expect(
      await db.prismaPublic.scheduleReminderFire.count({ where: { familyId: family.id } }),
    ).toBe(1)
  })

  it('날짜를 지우면 울릴 수 없는 알림도 함께 지운다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await setScheduleReminders(
      {
        entryId: entry.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'dayBefore', daysBefore: 1, atMinute: 540 }],
      },
      db.prismaPublic,
    )
    const updated = await updateScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id, patch: { title: 'a' } },
      db.prismaPublic,
    )
    expect(updated.onDate).toBeNull()
    expect(await db.prismaPublic.scheduleReminder.count({ where: { familyId: family.id } })).toBe(0)
  })

  it('남의 일정은 .any 권한이 없으면 고칠 수 없다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    const { user: other } = await signup(
      { email: `o3-${Date.now()}@b.com`, password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: other.id, role: 'family' },
    })
    await setSetting('permissions.family', ['schedule.edit.own'], null, db.prismaPublic)
    await expect(
      updateScheduleEntry(
        { id: entry.id, familyId: family.id, byUserId: other.id, patch: { title: 'x' } },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })
})

describe('setScheduleEntryDone', () => {
  it('완료하면 시각과 완료한 사람을 남긴다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a' },
      db.prismaPublic,
    )
    const done = await setScheduleEntryDone(
      { id: entry.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    expect(done.doneAt).not.toBeNull()
    expect(done.doneByUserId).toBe(user.id)
  })

  it('완료를 풀면 둘 다 지운다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a' },
      db.prismaPublic,
    )
    await setScheduleEntryDone(
      { id: entry.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    const undone = await setScheduleEntryDone(
      { id: entry.id, familyId: family.id, byUserId: user.id, done: false },
      db.prismaPublic,
    )
    expect(undone.doneAt).toBeNull()
    expect(undone.doneByUserId).toBeNull()
  })

  it('보기 권한만 있는 family 역할도 완료할 수 있다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a' },
      db.prismaPublic,
    )
    const { user: other } = await signup(
      { email: `o4-${Date.now()}@b.com`, password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: other.id, role: 'family' },
    })
    const done = await setScheduleEntryDone(
      { id: entry.id, familyId: family.id, byUserId: other.id, done: true },
      db.prismaPublic,
    )
    expect(done.doneByUserId).toBe(other.id)
  })
})

describe('deleteScheduleEntry', () => {
  it('soft delete 라 조회에서 빠진다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a' },
      db.prismaPublic,
    )
    await deleteScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const row = await db.prismaPublic.scheduleEntry.findFirst({
      where: { id: entry.id, familyId: family.id },
    })
    expect(row?.deletedAt).not.toBeNull()
  })

  it('이미 지운 일정은 다시 지울 수 없다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a' },
      db.prismaPublic,
    )
    await deleteScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    await expect(
      deleteScheduleEntry(
        { id: entry.id, familyId: family.id, byUserId: user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })
})
