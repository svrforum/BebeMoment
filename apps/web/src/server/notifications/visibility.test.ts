import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { resolveNotificationVisibility } from './visibility'

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
async function setupSecretStory(visibility: 'family' | 'guardians') {
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
      originalKey: `o-${counter}`,
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date('2026-03-01'),
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
      entryDate: '2026-04-02',
      body: 'x',
      visibility,
      assetIds: [asset.id],
      byUserId: user.id,
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  return { family, entry }
}

describe('resolveNotificationVisibility', () => {
  it('reads authoritative guardians visibility from DB for a story event', async () => {
    const { family, entry } = await setupSecretStory('guardians')
    const v = await resolveNotificationVisibility(
      { type: 'diary.created', familyId: family.id, payload: { entryId: entry.id } },
      db.prismaPublic,
    )
    expect(v).toBe('guardians')
  })

  it('overrides a stale/tampered family payload with the real guardians value (fail-closed)', async () => {
    const { family, entry } = await setupSecretStory('guardians')
    const v = await resolveNotificationVisibility(
      {
        type: 'diary.created',
        familyId: family.id,
        payload: { entryId: entry.id, visibility: 'family' },
      },
      db.prismaPublic,
    )
    expect(v).toBe('guardians')
  })

  it('reflects an in-flight change from guardians to family', async () => {
    const { family, entry } = await setupSecretStory('guardians')
    await db.prismaPublic.story.update({
      where: { id: entry.id },
      data: { visibility: 'family' },
    })
    const v = await resolveNotificationVisibility(
      {
        type: 'diary.created',
        familyId: family.id,
        payload: { entryId: entry.id, visibility: 'guardians' },
      },
      db.prismaPublic,
    )
    expect(v).toBe('family')
  })

  it('falls back to payload for non-story events (no entity to re-read)', async () => {
    const { family } = await setupSecretStory('family')
    const v = await resolveNotificationVisibility(
      { type: 'growth.created', familyId: family.id, payload: { visibility: 'guardians' } },
      db.prismaPublic,
    )
    expect(v).toBe('guardians')
  })
})
