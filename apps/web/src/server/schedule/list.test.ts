import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { addChecklistItem, setChecklistItemDone } from './checklist'
import { createScheduleEntry, deleteScheduleEntry, setScheduleEntryDone } from './entry'
import { getScheduleEntry, listScheduleMonth, listScheduleTodos } from './list'
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

describe('listScheduleMonth', () => {
  it('같은 날 여러 건을 세고 남은 것과 나눈다', async () => {
    const { user, family } = await setup()
    const a = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'b', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await setScheduleEntryDone(
      { id: a.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    const { days } = await listScheduleMonth(
      { familyId: family.id, year: 2026, month: 8 },
      db.prismaPublic,
    )
    expect(days).toEqual([{ day: '2026-09-24', total: 2, remaining: 1 }])
  })

  it('매년 반복은 그 달에 회차로 나타난다', async () => {
    const { user, family } = await setup()
    await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '생일',
        onDate: '2020-03-05',
        repeatYearly: true,
      },
      db.prismaPublic,
    )
    const { days } = await listScheduleMonth(
      { familyId: family.id, year: 2026, month: 2 },
      db.prismaPublic,
    )
    expect(days).toEqual([{ day: '2026-03-05', total: 1, remaining: 1 }])
  })

  it('날짜 없는 할 일은 달력에 나오지 않는다', async () => {
    const { user, family } = await setup()
    await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '기저귀 주문' },
      db.prismaPublic,
    )
    const { days } = await listScheduleMonth(
      { familyId: family.id, year: 2026, month: 8 },
      db.prismaPublic,
    )
    expect(days).toEqual([])
  })

  it('다른 가족의 일정은 섞이지 않는다', async () => {
    const mine = await setup('A')
    const theirs = await setup('B')
    await createScheduleEntry(
      {
        familyId: theirs.family.id,
        byUserId: theirs.user.id,
        title: '남의 일정',
        onDate: '2026-09-24',
      },
      db.prismaPublic,
    )
    const { days } = await listScheduleMonth(
      { familyId: mine.family.id, year: 2026, month: 8 },
      db.prismaPublic,
    )
    expect(days).toEqual([])
  })

  it('지운 일정은 달력에서 빠진다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await deleteScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const { days, entries } = await listScheduleMonth(
      { familyId: family.id, year: 2026, month: 8 },
      db.prismaPublic,
    )
    expect(days).toEqual([])
    expect(entries).toEqual([])
  })

  it('항목 목록은 그 달 회차의 날짜와 진행을 담는다', async () => {
    const { user, family } = await setup()
    const birthday = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '생일',
        onDate: '2020-03-05',
        repeatYearly: true,
      },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: birthday.id, familyId: family.id, byUserId: user.id, label: '케이크' },
      db.prismaPublic,
    )
    await addChecklistItem(
      { entryId: birthday.id, familyId: family.id, byUserId: user.id, label: '풍선' },
      db.prismaPublic,
    )
    await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    await setScheduleReminders(
      {
        entryId: birthday.id,
        familyId: family.id,
        byUserId: user.id,
        specs: [{ kind: 'dayBefore', daysBefore: 1, atMinute: 540 }],
      },
      db.prismaPublic,
    )
    const { entries } = await listScheduleMonth(
      { familyId: family.id, year: 2026, month: 2 },
      db.prismaPublic,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]?.id).toBe(birthday.id)
    expect(entries[0]?.onDate).toBe('2026-03-05')
    expect(entries[0]?.checklistTotal).toBe(2)
    expect(entries[0]?.checklistDone).toBe(1)
    expect(entries[0]?.reminderCount).toBe(1)
  })

  it('같은 날 여러 건은 시각 순으로 온다', async () => {
    const { user, family } = await setup()
    await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '오후',
        onDate: '2026-09-24',
        startMinute: 840,
      },
      db.prismaPublic,
    )
    await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '오전',
        onDate: '2026-09-24',
        startMinute: 600,
      },
      db.prismaPublic,
    )
    await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '종일', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    const { entries } = await listScheduleMonth(
      { familyId: family.id, year: 2026, month: 8 },
      db.prismaPublic,
    )
    expect(entries.map((e) => e.title)).toEqual(['종일', '오전', '오후'])
  })
})

describe('listScheduleTodos', () => {
  it('지난·오늘·예정·날짜없음·완료로 나눈다', async () => {
    const { user, family } = await setup()
    const mk = (title: string, onDate?: string) =>
      createScheduleEntry(
        { familyId: family.id, byUserId: user.id, title, ...(onDate ? { onDate } : {}) },
        db.prismaPublic,
      )
    await mk('지난것', '2026-09-20')
    await mk('오늘것', '2026-09-24')
    await mk('예정것', '2026-09-30')
    await mk('날짜없음')
    const finished = await mk('끝난것', '2026-09-21')
    await setScheduleEntryDone(
      { id: finished.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )

    const out = await listScheduleTodos(
      { familyId: family.id, todayKey: '2026-09-24' },
      db.prismaPublic,
    )
    expect(out.overdue.map((e) => e.title)).toEqual(['지난것'])
    expect(out.today.map((e) => e.title)).toEqual(['오늘것'])
    expect(out.upcoming.map((e) => e.title)).toEqual(['예정것'])
    expect(out.undated.map((e) => e.title)).toEqual(['날짜없음'])
    expect(out.done.map((e) => e.title)).toEqual(['끝난것'])
  })

  it('완료된 항목은 지난 목록에 들어가지 않는다', async () => {
    const { user, family } = await setup()
    const e = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x', onDate: '2026-09-01' },
      db.prismaPublic,
    )
    await setScheduleEntryDone(
      { id: e.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    const out = await listScheduleTodos(
      { familyId: family.id, todayKey: '2026-09-24' },
      db.prismaPublic,
    )
    expect(out.overdue).toHaveLength(0)
    expect(out.done).toHaveLength(1)
  })

  it('체크리스트 진행을 함께 돌려준다', async () => {
    const { user, family } = await setup()
    const e = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: e.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    await addChecklistItem(
      { entryId: e.id, familyId: family.id, byUserId: user.id, label: 'b' },
      db.prismaPublic,
    )
    await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    const out = await listScheduleTodos(
      { familyId: family.id, todayKey: '2026-09-24' },
      db.prismaPublic,
    )
    expect(out.undated[0]?.checklistTotal).toBe(2)
    expect(out.undated[0]?.checklistDone).toBe(1)
  })

  it('매년 반복은 다음 회차 날짜로 자리를 잡는다', async () => {
    const { user, family } = await setup()
    await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '생일',
        onDate: '2020-11-03',
        repeatYearly: true,
      },
      db.prismaPublic,
    )
    const out = await listScheduleTodos(
      { familyId: family.id, todayKey: '2026-09-24' },
      db.prismaPublic,
    )
    expect(out.overdue).toHaveLength(0)
    expect(out.upcoming.map((e) => e.onDate)).toEqual(['2026-11-03'])
  })

  it('다른 가족의 일정은 섞이지 않는다', async () => {
    const mine = await setup('A')
    const theirs = await setup('B')
    await createScheduleEntry(
      { familyId: theirs.family.id, byUserId: theirs.user.id, title: '남의 할 일' },
      db.prismaPublic,
    )
    const out = await listScheduleTodos(
      { familyId: mine.family.id, todayKey: '2026-09-24' },
      db.prismaPublic,
    )
    expect(out.undated).toHaveLength(0)
  })
})

describe('getScheduleEntry', () => {
  it('체크 항목과 알림을 함께 돌려준다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '돌잔치',
        memo: '메모',
        onDate: '2026-09-24',
        startMinute: 600,
      },
      db.prismaPublic,
    )
    await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '장소 예약' },
      db.prismaPublic,
    )
    await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '답례품' },
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
    const detail = await getScheduleEntry({ id: entry.id, familyId: family.id }, db.prismaPublic)
    expect(detail?.title).toBe('돌잔치')
    expect(detail?.memo).toBe('메모')
    expect(detail?.onDate).toBe('2026-09-24')
    expect(detail?.startMinute).toBe(600)
    expect(detail?.checklistItems.map((i) => i.label)).toEqual(['장소 예약', '답례품'])
    expect(detail?.checklistTotal).toBe(2)
    expect(detail?.reminders).toHaveLength(1)
    expect(detail?.reminders[0]?.leadMinutes).toBe(30)
  })

  /** 두 사람이 나눠 챙기는 목록이라 "누가 챙겼는지"가 핵심이다 — 왕복 한 번에 이름까지 싣는다. */
  it('체크한 사람의 이름을 함께 돌려준다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '준비물' },
      db.prismaPublic,
    )
    const ticked = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '기저귀' },
      db.prismaPublic,
    )
    await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '분유' },
      db.prismaPublic,
    )
    await setChecklistItemDone(
      { id: ticked.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    const detail = await getScheduleEntry({ id: entry.id, familyId: family.id }, db.prismaPublic)
    expect(detail?.checklistItems.map((i) => [i.label, i.doneByName])).toEqual([
      ['기저귀', 'T'],
      ['분유', null],
    ])
  })

  it('체크를 풀면 이름도 사라진다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '준비물' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '기저귀' },
      db.prismaPublic,
    )
    await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: user.id, done: false },
      db.prismaPublic,
    )
    const detail = await getScheduleEntry({ id: entry.id, familyId: family.id }, db.prismaPublic)
    expect(detail?.checklistItems[0]?.doneByName).toBe(null)
  })

  it('다른 가족의 일정은 찾지 못한다', async () => {
    const mine = await setup('A')
    const theirs = await setup('B')
    const entry = await createScheduleEntry(
      { familyId: theirs.family.id, byUserId: theirs.user.id, title: 'x' },
      db.prismaPublic,
    )
    expect(
      await getScheduleEntry({ id: entry.id, familyId: mine.family.id }, db.prismaPublic),
    ).toBe(null)
  })

  it('지운 일정은 찾지 못한다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    await deleteScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    expect(await getScheduleEntry({ id: entry.id, familyId: family.id }, db.prismaPublic)).toBe(
      null,
    )
  })
})
