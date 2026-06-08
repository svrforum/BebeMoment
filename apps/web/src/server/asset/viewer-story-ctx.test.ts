import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createAsset } from './create'
import { updateAssetStatus } from './update-status'
import { resolveStoryViewerCtx } from './viewer-story-ctx'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let counter = 0
async function secretStoryWithAsset(visibility: 'family' | 'guardians') {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  counter += 1
  const asset = await createAsset(
    {
      familyId: family.id,
      uploadedByUserId: user.id,
      kind: 'image',
      originalKey: `k-${counter}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date('2026-04-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus(
    { assetId: asset.id, familyId: family.id, status: 'ready' },
    db.prismaMedia,
  )
  const entry = await createStoryEntry(
    {
      familyId: family.id,
      babyId: null,
      entryDate: '2026-04-01',
      body: 'secret body',
      visibility,
      assetIds: [asset.id],
      byUserId: user.id,
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  return { family, entry, assetId: asset.id }
}

describe('resolveStoryViewerCtx', () => {
  it('self-filters a guardians story for the family role (returns null)', async () => {
    const { family, entry, assetId } = await secretStoryWithAsset('guardians')
    const result = await resolveStoryViewerCtx(
      `story:${entry.id}`,
      [assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'family',
    )
    expect(result).toBeNull()
  })

  it('returns the story body for owner viewing a guardians story', async () => {
    const { family, entry, assetId } = await secretStoryWithAsset('guardians')
    const result = await resolveStoryViewerCtx(
      `story:${entry.id}`,
      [assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'owner',
    )
    expect(result?.body).toBe('secret body')
    expect(result?.index).toBe(1)
    expect(result?.total).toBe(1)
  })

  it('family can see a normal (family) story body', async () => {
    const { family, entry, assetId } = await secretStoryWithAsset('family')
    const result = await resolveStoryViewerCtx(
      `story:${entry.id}`,
      [assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'family',
    )
    expect(result?.body).toBe('secret body')
  })
})
