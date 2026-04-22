import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createJournalEntry } from './create'

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

async function makeReadyAsset(
  familyId: string,
  userId: string,
  sha256: string,
  originalKey: string,
) {
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey,
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256,
      takenAt: new Date('2026-03-01'),
      takenAtSource: 'uploaded',
    },
    db.prisma,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prisma)
  return asset
}

describe('createJournalEntry', () => {
  it('creates entry with babyId', async () => {
    const { user, family, baby } = await setup()
    const entry = await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '오늘은 좋은 하루',
        byUserId: user.id,
      },
      db.prisma,
    )
    expect(entry.familyId).toBe(family.id)
    expect(entry.babyId).toBe(baby.id)
    expect(entry.body).toBe('오늘은 좋은 하루')
  })

  it('creates family-wide entry with babyId=null', async () => {
    const { user, family } = await setup()
    const entry = await createJournalEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-02',
        body: '가족 전체 메모',
        byUserId: user.id,
      },
      db.prisma,
    )
    expect(entry.babyId).toBeNull()
    expect(entry.body).toBe('가족 전체 메모')
  })

  it('rejects empty body', async () => {
    const { user, family, baby } = await setup()
    await expect(
      createJournalEntry(
        {
          familyId: family.id,
          babyId: baby.id,
          entryDate: '2026-04-01',
          body: '',
          byUserId: user.id,
        },
        db.prisma,
      ),
    ).rejects.toThrow()
  })

  it('rejects invalid mood', async () => {
    const { user, family, baby } = await setup()
    await expect(
      createJournalEntry(
        {
          familyId: family.id,
          babyId: baby.id,
          entryDate: '2026-04-01',
          body: '좋음',
          mood: 'ecstatic',
          byUserId: user.id,
        },
        db.prisma,
      ),
    ).rejects.toThrow()
  })

  it('preserves asset order', async () => {
    const { user, family, baby } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, 'a'.repeat(64), 'o1')
    const a2 = await makeReadyAsset(family.id, user.id, 'b'.repeat(64), 'o2')
    const entry = await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '사진 두 장',
        assetIds: [a2.id, a1.id],
        byUserId: user.id,
      },
      db.prisma,
    )
    const rows = await db.prisma.journalEntryAsset.findMany({
      where: { entryId: entry.id },
      orderBy: { order: 'asc' },
    })
    expect(rows.map((r) => r.assetId)).toEqual([a2.id, a1.id])
    expect(rows.map((r) => r.order)).toEqual([0, 1])
  })
})
