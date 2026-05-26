import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createDiaryEntry } from './create'
import { updateDiaryEntry } from './update'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.journalEntryAsset.deleteMany()
  await db.prismaPublic.journalEntry.deleteMany()
  await db.prismaMedia.assetBaby.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.baby.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prismaPublic,
  )
  return { user, family, baby }
}

describe('updateDiaryEntry', () => {
  it('updates own title and body', async () => {
    const { user, family, baby } = await setup()
    const entry = await createDiaryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        title: '원제목',
        body: '원본문',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateDiaryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { title: '새제목', body: '새본문' },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.title).toBe('새제목')
    expect(updated.body).toBe('새본문')
  })

  it('toggles babyId to null', async () => {
    const { user, family, baby } = await setup()
    const entry = await createDiaryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateDiaryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { babyId: null },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.babyId).toBeNull()
  })
})
