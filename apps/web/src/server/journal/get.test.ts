import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { createJournalEntry } from './create'
import { getJournalEntry } from './get'

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

describe('getJournalEntry', () => {
  it('returns entry with assets and baby', async () => {
    const { user, family, baby } = await setup()
    const asset = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'o1',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: 'a'.repeat(64),
        takenAt: new Date('2026-03-01'),
        takenAtSource: 'uploaded',
      },
      db.prisma,
    )
    await updateAssetStatus(
      { assetId: asset.id, familyId: family.id, status: 'ready' },
      db.prisma,
    )
    const entry = await createJournalEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        assetIds: [asset.id],
        byUserId: user.id,
      },
      db.prisma,
    )
    const found = await getJournalEntry(entry.id, family.id, db.prisma)
    expect(found?.id).toBe(entry.id)
    expect(found?.assets).toHaveLength(1)
    expect(found?.assets[0]?.asset.id).toBe(asset.id)
    expect(found?.baby?.id).toBe(baby.id)
  })

  it('returns null for entry in another family', async () => {
    const { user, family, baby } = await setup()
    const { family: family2 } = await createFamily({ name: 'F2', userId: user.id }, db.prisma)
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
    const found = await getJournalEntry(entry.id, family2.id, db.prisma)
    expect(found).toBeNull()
  })
})
