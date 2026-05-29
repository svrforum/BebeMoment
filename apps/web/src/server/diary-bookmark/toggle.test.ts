import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createDiaryEntry } from '../diary/create'
import { createFamily } from '../family/create'
import { toggleDiaryBookmark } from './toggle'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.journalBookmark.deleteMany()
  await db.prismaPublic.journalEntryAsset.deleteMany()
  await db.prismaPublic.journalEntry.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    {
      email: `t-${Date.now()}-${Math.random()}@b.com`,
      password: 'password123',
      displayName: 'Alice',
    },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeEntry(familyId: string, userId: string) {
  return createDiaryEntry(
    {
      familyId,
      byUserId: userId,
      babyId: null,
      entryDate: '2026-05-29',
      title: 'hi',
      body: 'hello',
      assetIds: [],
    },
    db.prismaPublic,
    db.prismaMedia,
    async () => {},
  )
}

describe('toggleDiaryBookmark', () => {
  it('adds when absent', async () => {
    const { user, family } = await setup()
    const entry = await makeEntry(family.id, user.id)
    const result = await toggleDiaryBookmark(
      { entryId: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    expect(result.bookmarked).toBe(true)
    const stored = await db.prismaPublic.journalBookmark.findFirst({
      where: { entryId: entry.id, userId: user.id, familyId: family.id },
    })
    expect(stored).not.toBeNull()
  })

  it('removes when present', async () => {
    const { user, family } = await setup()
    const entry = await makeEntry(family.id, user.id)
    await toggleDiaryBookmark(
      { entryId: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    const result = await toggleDiaryBookmark(
      { entryId: entry.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
    )
    expect(result.bookmarked).toBe(false)
  })

  it('rejects foreign entry', async () => {
    const { user, family } = await setup()
    const { user: u2 } = await signup(
      { email: 'u2@u2.com', password: 'password123', displayName: 'Bob' },
      db.prismaPublic,
    )
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prismaPublic)
    const foreign = await makeEntry(f2.id, u2.id)
    await expect(
      toggleDiaryBookmark(
        { entryId: foreign.id, familyId: family.id, byUserId: user.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/not found|entry/i)
  })

  it('rejects non-member', async () => {
    const { user, family } = await setup()
    const entry = await makeEntry(family.id, user.id)
    const { user: other } = await signup(
      { email: 'o@o.com', password: 'password123', displayName: 'Other' },
      db.prismaPublic,
    )
    await expect(
      toggleDiaryBookmark(
        { entryId: entry.id, familyId: family.id, byUserId: other.id },
        db.prismaPublic,
      ),
    ).rejects.toThrow(/permission/i)
  })
})
