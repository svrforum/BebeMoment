import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { addChecklistItem } from '../schedule/checklist'
import { createScheduleEntry, deleteScheduleEntry } from '../schedule/entry'
import { createShareLink } from './create'
import { listMyShareLinks, listShareLinks } from './manage'
import { getPublicSchedulePreview } from './public-schedule'
import { resolveShareLink } from './resolve'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.shareLink.deleteMany()
  await db.prismaPublic.scheduleChecklistItem.deleteMany()
  await db.prismaPublic.scheduleEntry.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup(name = 'Fam') {
  const { user } = await signup(
    {
      username: `o${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      password: 'password123',
      displayName: 'O',
    },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name, userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeEntry(familyId: string, userId: string) {
  const entry = await createScheduleEntry(
    {
      familyId,
      byUserId: userId,
      title: '강남 진료',
      memo: '대변검사 결과서 챙기기',
      onDate: '2026-09-23',
      startMinute: 600,
    },
    db.prismaPublic,
    async () => {},
  )
  await addChecklistItem(
    { entryId: entry.id, familyId, byUserId: userId, label: '분유' },
    db.prismaPublic,
  )
  return entry
}

describe('일정 공유 링크', () => {
  it('발급한 링크는 일정 타깃으로 해석된다', async () => {
    const { user, family } = await setup()
    const entry = await makeEntry(family.id, user.id)
    const { token } = await createShareLink(
      {
        target: { kind: 'schedule', entryId: entry.id },
        familyId: family.id,
        userId: user.id,
        ttl: '7d',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const r = await resolveShareLink(token, db.prismaPublic)
    expect(r).toMatchObject({ status: 'ok', target: { kind: 'schedule', entryId: entry.id } })
  })

  it('다른 가족의 일정으로는 링크를 만들 수 없다', async () => {
    const mine = await setup('A')
    const theirs = await setup('B')
    const theirEntry = await makeEntry(theirs.family.id, theirs.user.id)
    await expect(
      createShareLink(
        {
          target: { kind: 'schedule', entryId: theirEntry.id },
          familyId: mine.family.id,
          userId: mine.user.id,
          ttl: '7d',
        },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/scheduleNotFound/)
  })

  it('지운 일정으로는 링크를 만들 수 없다', async () => {
    const { user, family } = await setup()
    const entry = await makeEntry(family.id, user.id)
    await deleteScheduleEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    await expect(
      createShareLink(
        {
          target: { kind: 'schedule', entryId: entry.id },
          familyId: family.id,
          userId: user.id,
          ttl: '7d',
        },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow(/scheduleNotFound/)
  })

  it('일정별 링크 목록과 내 링크 목록에 일정으로 나온다', async () => {
    const { user, family } = await setup()
    const entry = await makeEntry(family.id, user.id)
    const { token } = await createShareLink(
      {
        target: { kind: 'schedule', entryId: entry.id },
        familyId: family.id,
        userId: user.id,
        ttl: 'permanent',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const perTarget = await listShareLinks(
      { kind: 'schedule', entryId: entry.id },
      family.id,
      db.prismaPublic,
    )
    expect(perTarget.map((l) => l.token)).toEqual([token])
    const mine = await listMyShareLinks(family.id, user.id, db.prismaPublic)
    expect(mine.find((l) => l.token === token)).toMatchObject({
      kind: 'schedule',
      target: entry.id,
    })
  })
})

describe('getPublicSchedulePreview', () => {
  it('로그인 전에 보일 것 — 가족 이름·제목·날짜·시각만 담는다', async () => {
    const { user, family } = await setup('우리집')
    const entry = await makeEntry(family.id, user.id)
    const p = await getPublicSchedulePreview(entry.id, family.id, db.prismaPublic)
    expect(p).toEqual({
      familyName: '우리집',
      entryId: entry.id,
      title: '강남 진료',
      onDate: '2026-09-23',
      startMinute: 600,
    })
  })

  it('메모와 체크리스트는 어떤 필드로도 싣지 않는다', async () => {
    const { user, family } = await setup()
    const entry = await makeEntry(family.id, user.id)
    const p = await getPublicSchedulePreview(entry.id, family.id, db.prismaPublic)
    const serialized = JSON.stringify(p)
    expect(serialized).not.toContain('대변검사')
    expect(serialized).not.toContain('분유')
  })

  it('지워진 일정이나 다른 가족의 일정은 없는 것으로 본다', async () => {
    const mine = await setup('A')
    const theirs = await setup('B')
    const entry = await makeEntry(mine.family.id, mine.user.id)
    expect(await getPublicSchedulePreview(entry.id, theirs.family.id, db.prismaPublic)).toBeNull()
    await deleteScheduleEntry(
      { id: entry.id, familyId: mine.family.id, byUserId: mine.user.id },
      db.prismaPublic,
    )
    expect(await getPublicSchedulePreview(entry.id, mine.family.id, db.prismaPublic)).toBeNull()
  })
})
