import { readFile } from 'node:fs/promises'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { NotificationJob } from '@bebe/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
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
  await db.prismaPublic.baby.deleteMany()
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

  it('관리자가 설정으로 권한을 줘도 family 역할은 만들 수 없다 — 보호자 전용이다', async () => {
    const { family } = await setup()
    const { user: other } = await signup(
      { email: `o2-${Date.now()}@b.com`, password: 'password123', displayName: 'O' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: other.id, role: 'family' },
    })
    // 설정 자체가 부여 가능 목록 밖의 값을 거부한다 — 저장될 길이 없다.
    await expect(
      setSetting('permissions.family', ['schedule.create'], null, db.prismaPublic),
    ).rejects.toThrow()
    await expect(
      createScheduleEntry(
        { familyId: family.id, byUserId: other.id, title: 'x', onDate: '2026-09-24' },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('guardian 은 일정을 만들 수 있다', async () => {
    const { family } = await setup()
    const { user: guardian } = await signup(
      {
        email: `g-${Date.now()}-${Math.random()}@b.com`,
        password: 'password123',
        displayName: 'G',
      },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: guardian.id, role: 'guardian' },
    })
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: guardian.id, title: 'x', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    expect(entry.id).toBeTruthy()
  })
})

describe('아기 연결', () => {
  it('우리 가족 아기는 연결할 수 있다', async () => {
    const { user, family } = await setup()
    const baby = await createBaby(
      { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
      db.prismaPublic,
    )
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '접종',
        onDate: '2026-09-24',
        babyId: baby.id,
      },
      db.prismaPublic,
    )
    expect(entry.babyId).toBe(baby.id)
  })

  it('다른 가족의 아기는 연결할 수 없다', async () => {
    const mine = await setup('A')
    const theirs = await setup('B')
    const theirBaby = await createBaby(
      { familyId: theirs.family.id, name: 'B', birthDate: '2026-01-01', byUserId: theirs.user.id },
      db.prismaPublic,
    )
    await expect(
      createScheduleEntry(
        {
          familyId: mine.family.id,
          byUserId: mine.user.id,
          title: 'x',
          onDate: '2026-09-24',
          babyId: theirBaby.id,
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/babyNotFound/)
  })

  it('없는 아기 id 는 그 자리에서 거절한다', async () => {
    const { user, family } = await setup()
    await expect(
      createScheduleEntry(
        {
          familyId: family.id,
          byUserId: user.id,
          title: 'x',
          onDate: '2026-09-24',
          babyId: '00000000-0000-0000-0000-000000000000',
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/babyNotFound/)
  })

  it('수정으로도 다른 가족의 아기를 붙일 수 없다', async () => {
    const mine = await setup('A')
    const theirs = await setup('B')
    const theirBaby = await createBaby(
      { familyId: theirs.family.id, name: 'B', birthDate: '2026-01-01', byUserId: theirs.user.id },
      db.prismaPublic,
    )
    const entry = await createScheduleEntry(
      { familyId: mine.family.id, byUserId: mine.user.id, title: 'x', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    await expect(
      updateScheduleEntry(
        {
          id: entry.id,
          familyId: mine.family.id,
          byUserId: mine.user.id,
          patch: { title: 'x', babyId: theirBaby.id },
        },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/babyNotFound/)
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

  it('일반 구성원은 남의 일정은 물론 어떤 일정도 고칠 수 없다', async () => {
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
    await expect(
      updateScheduleEntry(
        { id: entry.id, familyId: family.id, byUserId: other.id, patch: { title: 'x' } },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('guardian 은 남의 일정도 고칠 수 있다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a', onDate: '2026-09-24' },
      db.prismaPublic,
    )
    const { user: guardian } = await signup(
      {
        email: `g2-${Date.now()}-${Math.random()}@b.com`,
        password: 'password123',
        displayName: 'G',
      },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: guardian.id, role: 'guardian' },
    })
    const updated = await updateScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: guardian.id, patch: { title: 'x' } },
      db.prismaPublic,
    )
    expect(updated.title).toBe('x')
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

  it('일반 구성원은 완료 표시도 할 수 없다', async () => {
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
    await expect(
      setScheduleEntryDone(
        { id: entry.id, familyId: family.id, byUserId: other.id, done: true },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('guardian 은 완료 표시를 할 수 있다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'a' },
      db.prismaPublic,
    )
    const { user: guardian } = await signup(
      {
        email: `g3-${Date.now()}-${Math.random()}@b.com`,
        password: 'password123',
        displayName: 'G',
      },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: guardian.id, role: 'guardian' },
    })
    const done = await setScheduleEntryDone(
      { id: entry.id, familyId: family.id, byUserId: guardian.id, done: true },
      db.prismaPublic,
    )
    expect(done.doneByUserId).toBe(guardian.id)
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

describe('일정 생성 알림', () => {
  it('생성하면 다른 보호자에게 알릴 잡을 넣는다', async () => {
    const { user, family } = await setup()
    const jobs: NotificationJob[] = []
    const entry = await createScheduleEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        title: '예방접종',
        onDate: '2026-09-24',
        startMinute: 600,
      },
      db.prismaPublic,
      async (job) => {
        jobs.push(job)
      },
    )
    expect(jobs).toEqual([
      {
        familyId: family.id,
        actorUserId: user.id,
        type: 'schedule.created',
        payload: {
          entryId: entry.id,
          title: '예방접종',
          onDate: '2026-09-24',
          startMinute: '600',
        },
      },
    ])
  })

  it('종일·날짜 없는 일정은 시각·날짜를 싣지 않는다', async () => {
    const { user, family } = await setup()
    const jobs: NotificationJob[] = []
    const push = async (job: NotificationJob) => {
      jobs.push(job)
    }
    await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '돌잔치', onDate: '2026-09-24' },
      db.prismaPublic,
      push,
    )
    await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '기저귀 주문' },
      db.prismaPublic,
      push,
    )
    expect(jobs.map((j) => j.payload)).toEqual([
      { entryId: expect.any(String), title: '돌잔치', onDate: '2026-09-24' },
      { entryId: expect.any(String), title: '기저귀 주문' },
    ])
  })

  it('권한이 없어 거절되면 알리지 않는다', async () => {
    const { user, family } = await setup()
    const other = await signup(
      { email: `x-${Date.now()}@b.com`, password: 'password123', displayName: 'X' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: other.user.id, role: 'family' },
    })
    const jobs: NotificationJob[] = []
    await expect(
      createScheduleEntry(
        { familyId: family.id, byUserId: other.user.id, title: '몰래' },
        db.prismaPublic,
        async (job) => {
          jobs.push(job)
        },
      ),
    ).rejects.toThrow()
    expect(jobs).toEqual([])
    expect(user.id).not.toBe(other.user.id)
  })

  /**
   * 소스를 직접 본다. 이 파일의 쓰기 중 알림을 직접 보내는 건 생성뿐이어야 한다. 변경 알림은
   * 수정 액션이 저장 세 단계를 모두 마친 뒤 `updated-notice.ts` 로 보낸다 — 일정 필드만 고친
   * 시점에 여기서 보내면 체크리스트·알림 저장이 실패해도 "바뀌었어요" 가 먼저 나간다. 삭제·완료는
   * 알리지 않는다.
   */
  it('이 파일에서 알림을 직접 보내는 곳은 생성 하나뿐이다', async () => {
    const source = await readFile(new URL('./entry.ts', import.meta.url), 'utf8')
    const calls = source.match(/\benqueue\(/g) ?? []
    expect(calls).toHaveLength(1)

    const createStart = source.indexOf('export async function createScheduleEntry')
    const createEnd = source.indexOf('export async function', createStart + 1)
    const createBody = source.slice(createStart, createEnd === -1 ? undefined : createEnd)
    expect(createBody).toContain('enqueue(')
  })
})
