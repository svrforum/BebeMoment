import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createJournalEntry } from './create'
import { listJournalEntries } from './list'

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

describe('listJournalEntries', () => {
  it('returns entries in desc order by entryDate', async () => {
    const { user, family, baby } = await setup()
    await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'A',
        byUserId: user.id,
      },
      db.prisma,
    )
    await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-10',
        body: 'B',
        byUserId: user.id,
      },
      db.prisma,
    )
    await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-05',
        body: 'C',
        byUserId: user.id,
      },
      db.prisma,
    )
    const { items, nextCursor } = await listJournalEntries(family.id, {}, db.prisma)
    expect(items.map((e) => e.body)).toEqual(['B', 'C', 'A'])
    expect(nextCursor).toBeNull()
  })

  it('filters by babyId', async () => {
    const { user, family, baby } = await setup()
    const baby2 = await createBaby(
      { familyId: family.id, name: 'B2', birthDate: '2026-01-15', byUserId: user.id },
      db.prisma,
    )
    await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: 'for-b1',
        byUserId: user.id,
      },
      db.prisma,
    )
    await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby2.id,
        entryDate: '2026-04-02',
        body: 'for-b2',
        byUserId: user.id,
      },
      db.prisma,
    )
    const { items } = await listJournalEntries(family.id, { babyId: baby.id }, db.prisma)
    expect(items).toHaveLength(1)
    expect(items[0]?.body).toBe('for-b1')
  })

  it('paginates via cursor', async () => {
    const { user, family, baby } = await setup()
    for (let i = 0; i < 5; i += 1) {
      await createJournalEntry(
        {
          familyId: family.id,
          babyId: baby.id,
          entryDate: `2026-04-0${i + 1}`,
          body: `E${i}`,
          byUserId: user.id,
        },
        db.prisma,
      )
    }
    const page1 = await listJournalEntries(family.id, { limit: 3 }, db.prisma)
    expect(page1.items).toHaveLength(3)
    expect(page1.nextCursor).not.toBeNull()
    const page2 = await listJournalEntries(
      family.id,
      { limit: 3, cursor: page1.nextCursor as string },
      db.prisma,
    )
    expect(page2.items).toHaveLength(2)
    expect(page2.nextCursor).toBeNull()
    const combinedIds = [...page1.items, ...page2.items].map((e) => e.id)
    expect(new Set(combinedIds).size).toBe(5)
  })
})
