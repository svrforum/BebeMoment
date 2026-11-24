import { randomUUID } from 'node:crypto'
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

// 타임라인·검색·캘린더에서 열어도 그 사진이 속한 스토리 본문은 보여야 한다 — 예전엔
// 스토리 화면에서 열 때만 보여서, 타임라인에서 바로 여는 가족에겐 본문이 없는 기능이었다.
// 앞뒤 사진이 스토리 순서가 아니므로 순번(1/4)은 없다.
describe('resolveStoryViewerCtx — opened outside the story', () => {
  it('returns the body of the story the photo belongs to, without a position', async () => {
    const { family, entry, assetId } = await secretStoryWithAsset('family')
    const result = await resolveStoryViewerCtx(
      'timeline',
      [randomUUID(), assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'family',
    )
    const story = await db.prismaPublic.story.findUniqueOrThrow({ where: { id: entry.id } })
    expect(result).toEqual({
      id: entry.id,
      shareable: true,
      body: 'secret body',
      publicNo: story.publicNo,
      index: null,
      total: null,
    })
  })

  // 뷰어의 공유 버튼이 '스토리' 를 고르게 해 주려면 스토리 id 가 있어야 하고, 보호자 전용
  // 스토리는 링크를 만들 수 없으므로(createShareLink 가 거절) 고르는 칸 자체를 내지 않는다.
  it('marks a guardians story as not shareable, even for the owner', async () => {
    const { family, entry, assetId } = await secretStoryWithAsset('guardians')
    const result = await resolveStoryViewerCtx(
      'timeline',
      [assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'owner',
    )
    expect(result?.id).toBe(entry.id)
    expect(result?.shareable).toBe(false)
  })

  it('carries the story id when opened from the story itself', async () => {
    const { family, entry, assetId } = await secretStoryWithAsset('family')
    const result = await resolveStoryViewerCtx(
      `story:${entry.id}`,
      [assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'family',
    )
    expect(result?.id).toBe(entry.id)
    expect(result?.shareable).toBe(true)
    expect(result?.index).toBe(1)
  })

  it('works without any ctx', async () => {
    const { family, assetId } = await secretStoryWithAsset('family')
    const result = await resolveStoryViewerCtx(
      undefined,
      undefined,
      assetId,
      family.id,
      db.prismaPublic,
      'family',
    )
    expect(result?.body).toBe('secret body')
    expect(result?.index).toBeNull()
  })

  it('keeps a guardians story hidden from the family role', async () => {
    const { family, assetId } = await secretStoryWithAsset('guardians')
    const result = await resolveStoryViewerCtx(
      'timeline',
      [assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'family',
    )
    expect(result).toBeNull()
  })

  it('shows a guardians story to the owner', async () => {
    const { family, assetId } = await secretStoryWithAsset('guardians')
    const result = await resolveStoryViewerCtx(
      'timeline',
      [assetId],
      assetId,
      family.id,
      db.prismaPublic,
      'owner',
    )
    expect(result?.body).toBe('secret body')
  })

  it('returns null for a photo that is in no story', async () => {
    const { family } = await secretStoryWithAsset('family')
    const result = await resolveStoryViewerCtx(
      'timeline',
      undefined,
      randomUUID(),
      family.id,
      db.prismaPublic,
      'owner',
    )
    expect(result).toBeNull()
  })

  it('does not leak a story from another family', async () => {
    const { assetId } = await secretStoryWithAsset('family')
    const other = await secretStoryWithAsset('family')
    const result = await resolveStoryViewerCtx(
      'timeline',
      undefined,
      assetId,
      other.family.id,
      db.prismaPublic,
      'owner',
    )
    expect(result).toBeNull()
  })
})
