import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createJournalEntry } from './create'
import { updateJournalEntry } from './update'

let db: TestDb
beforeAll(async () => {
  db = await startTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.journalEntryAsset.deleteMany()
  await db.prisma.journalEntry.deleteMany()
  await db.prisma.assetBaby.deleteMany()
  await db.prisma.asset.deleteMany()
  await db.prisma.baby.deleteMany()
  await db.prisma.membership.deleteMany()
  await db.prisma.family.deleteMany()
  await db.prisma.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prisma,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prisma)
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prisma,
  )
  return { user, family, baby }
}

describe('updateJournalEntry', () => {
  it('updates own title and body', async () => {
    const { user, family, baby } = await setup()
    const entry = await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        title: '원제목',
        body: '원본문',
        byUserId: user.id,
      },
      db.prisma,
    )
    const updated = await updateJournalEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { title: '새제목', body: '새본문' },
      },
      db.prisma,
    )
    expect(updated.title).toBe('새제목')
    expect(updated.body).toBe('새본문')
  })

  it('toggles babyId to null', async () => {
    const { user, family, baby } = await setup()
    const entry = await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        byUserId: user.id,
      },
      db.prisma,
    )
    const updated = await updateJournalEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { babyId: null },
      },
      db.prisma,
    )
    expect(updated.babyId).toBeNull()
  })
})
