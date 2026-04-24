import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createJournalEntry } from '../journal/create'
import { listTimeline } from './merged-list'

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
  return { user, family }
}

async function makeAsset(familyId: string, userId: string, takenAt: Date, sha: string) {
  const a = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(1),
      sha256: sha.padEnd(64, '0'),
      takenAt,
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('listTimeline', () => {
  it('returns empty when no data', async () => {
    const { family } = await setup()
    const { items, nextCursor } = await listTimeline(
      family.id,
      {},
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(items).toEqual([])
    expect(nextCursor).toBeNull()
  })

  it('interleaves assets and journal by descending date', async () => {
    const { user, family } = await setup()
    await makeAsset(family.id, user.id, new Date('2026-04-10'), 'a1')
    await createJournalEntry(
      { familyId: family.id, babyId: null, entryDate: '2026-04-12', body: 'b', byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    await makeAsset(family.id, user.id, new Date('2026-04-15'), 'a2')
    const { items } = await listTimeline(
      family.id,
      { limit: 10 },
      db.prismaPublic,
      db.prismaMedia,
    )
    const kinds = items.map((i) => i.kind)
    const dates = items.map((i) => i.ts.toISOString().slice(0, 10))
    expect(kinds).toEqual(['asset', 'journal', 'asset'])
    expect(dates).toEqual(['2026-04-15', '2026-04-12', '2026-04-10'])
  })

  it('supports cursor-based pagination', async () => {
    const { user, family } = await setup()
    for (let i = 0; i < 5; i++) {
      await makeAsset(family.id, user.id, new Date(`2026-04-${10 + i}`), `a${i}`)
    }
    const p1 = await listTimeline(family.id, { limit: 3 }, db.prismaPublic, db.prismaMedia)
    expect(p1.items.length).toBe(3)
    expect(p1.nextCursor).not.toBeNull()
    const p2 = await listTimeline(
      family.id,
      { limit: 3, cursor: p1.nextCursor as string },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(p2.items.length).toBe(2)
    expect(p2.nextCursor).toBeNull()
  })
})
