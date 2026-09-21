import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import {
  addChecklistItem,
  removeChecklistItem,
  renameChecklistItem,
  setChecklistItemDone,
} from './checklist'
import { createScheduleEntry } from './entry'

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

async function addGuardian(familyId: string, tag: string) {
  const { user } = await signup(
    {
      email: `${tag}-${Date.now()}-${Math.random()}@b.com`,
      password: 'password123',
      displayName: 'G',
    },
    db.prismaPublic,
  )
  await db.prismaPublic.membership.create({ data: { familyId, userId: user.id, role: 'guardian' } })
  return user
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

describe('checklist', () => {
  it('항목을 추가하면 뒤에 붙는다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '돌잔치' },
      db.prismaPublic,
    )
    const a = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '장소 예약' },
      db.prismaPublic,
    )
    const b = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '답례품' },
      db.prismaPublic,
    )
    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
  })

  it('빈 이름은 거절한다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    await expect(
      addChecklistItem(
        { entryId: entry.id, familyId: family.id, byUserId: user.id, label: '   ' },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('다른 가족의 일정에는 붙일 수 없다', async () => {
    const { user, family } = await setup('A')
    const other = await setup('B')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    await expect(
      addChecklistItem(
        { entryId: entry.id, familyId: other.family.id, byUserId: other.user.id, label: 'a' },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('이름을 고친다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    const renamed = await renameChecklistItem(
      { id: item.id, familyId: family.id, byUserId: user.id, label: '답례품 고르기' },
      db.prismaPublic,
    )
    expect(renamed.label).toBe('답례품 고르기')
  })

  it('항목을 지운다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    await removeChecklistItem(
      { id: item.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const left = await db.prismaPublic.scheduleChecklistItem.count({
      where: { familyId: family.id, entryId: entry.id },
    })
    expect(left).toBe(0)
  })

  it('체크하면 누가 했는지 남는다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    const done = await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    expect(done.doneByUserId).toBe(user.id)
    expect(done.doneAt).not.toBeNull()
  })

  it('체크를 풀면 둘 다 지운다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: user.id, done: true },
      db.prismaPublic,
    )
    const undone = await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: user.id, done: false },
      db.prismaPublic,
    )
    expect(undone.doneAt).toBeNull()
    expect(undone.doneByUserId).toBeNull()
  })

  it('보호자가 아닌 구성원은 체크할 수 없다', async () => {
    const { user, family } = await setup()
    const viewer = await addViewer(family.id, 'v')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    await expect(
      setChecklistItemDone(
        { id: item.id, familyId: family.id, byUserId: viewer.id, done: true },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('만든 사람이 아닌 guardian 도 체크할 수 있다', async () => {
    const { user, family } = await setup()
    const guardian = await addGuardian(family.id, 'g')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    const done = await setChecklistItemDone(
      { id: item.id, familyId: family.id, byUserId: guardian.id, done: true },
      db.prismaPublic,
    )
    expect(done.doneByUserId).toBe(guardian.id)
  })

  it('보호자가 아닌 구성원은 항목을 추가할 수 없다', async () => {
    const { user, family } = await setup()
    const viewer = await addViewer(family.id, 'v2')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    await expect(
      addChecklistItem(
        { entryId: entry.id, familyId: family.id, byUserId: viewer.id, label: 'b' },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('보기 권한만 있는 family 역할은 이름을 고치거나 지울 수 없다', async () => {
    const { user, family } = await setup()
    const viewer = await addViewer(family.id, 'v3')
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    const item = await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    await expect(
      renameChecklistItem(
        { id: item.id, familyId: family.id, byUserId: viewer.id, label: 'c' },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
    await expect(
      removeChecklistItem(
        { id: item.id, familyId: family.id, byUserId: viewer.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
  })

  it('일정을 지우면 항목도 사라진다', async () => {
    const { user, family } = await setup()
    const entry = await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: 'x' },
      db.prismaPublic,
    )
    await addChecklistItem(
      { entryId: entry.id, familyId: family.id, byUserId: user.id, label: 'a' },
      db.prismaPublic,
    )
    await db.prismaPublic.scheduleEntry.deleteMany({ where: { id: entry.id, familyId: family.id } })
    const left = await db.prismaPublic.scheduleChecklistItem.count({
      where: { familyId: family.id, entryId: entry.id },
    })
    expect(left).toBe(0)
  })
})
