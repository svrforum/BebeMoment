import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createJournalEntry } from './create'
import { softDeleteJournalEntry } from './soft-delete'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
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

describe('softDeleteJournalEntry', () => {
  it('soft-deletes own entry', async () => {
    const { user, family, baby } = await setup()
    const entry = await createJournalEntry(
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
    await softDeleteJournalEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const fresh = await db.prismaPublic.journalEntry.findUnique({ where: { id: entry.id } })
    expect(fresh?.deletedAt).not.toBeNull()
  })
})
