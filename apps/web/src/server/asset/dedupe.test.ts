import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
import { findDuplicate } from './dedupe'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('findDuplicate', () => {
  it('returns null when no prior asset', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    expect(await findDuplicate(family.id, 'a'.repeat(64), db.prismaMedia)).toBeNull()
  })

  it('returns existing asset with same sha256', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const sha = 'b'.repeat(64)
    const first = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'k',
        originalFilename: 'f.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100n,
        sha256: sha,
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const result = await findDuplicate(family.id, sha, db.prismaMedia)
    expect(result?.id).toBe(first.id)
  })

  it('does not leak across families', async () => {
    const { user: u1 } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { user: u2 } = await signup(
      { email: 'c@d.com', password: 'password123', displayName: 'C' },
      db.prismaPublic,
    )
    const { family: f1 } = await createFamily({ name: 'F1', userId: u1.id }, db.prismaPublic)
    const { family: f2 } = await createFamily({ name: 'F2', userId: u2.id }, db.prismaPublic)
    const sha = 'c'.repeat(64)
    await createAsset(
      {
        familyId: f1.id,
        uploadedByUserId: u1.id,
        kind: 'image',
        originalKey: 'k',
        originalFilename: 'f.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100n,
        sha256: sha,
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(await findDuplicate(f2.id, sha, db.prismaMedia)).toBeNull()
  })
})
