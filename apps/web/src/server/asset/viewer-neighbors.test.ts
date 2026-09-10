import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { buildTimelineGroups } from '@/server/timeline/build-groups'
import { listTimeline } from '@/server/timeline/merged-list'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createAsset } from './create'
import { updateAssetStatus } from './update-status'
import { resolveNeighborIds } from './viewer-neighbors'

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

async function setup() {
  const { user } = await signup(
    { email: `t-${Date.now()}-${Math.random()}@b.com`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeReadyAsset(
  familyId: string,
  userId: string,
  sha: string,
  takenAt: Date,
): Promise<string> {
  const a = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: sha.padEnd(64, '0'),
      takenAt,
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: a.id, familyId, status: 'ready' }, db.prismaMedia)
  return a.id
}

const viewer = (familyId: string, userId: string) =>
  ({ familyId, userId, viewerRole: 'owner' as const }) as const

describe('resolveNeighborIds — timeline', () => {
  it('스토리 사진 구간에서 그리드와 같은 순서를 준다(시간 역순이 아니라)', async () => {
    const { user, family } = await setup()
    // 같은 날 찍힌 세 장 — 시간 오름차순으로 스토리에 담는다(사람들이 담는 방식).
    const first = await makeReadyAsset(family.id, user.id, 'ta', new Date('2026-05-01T01:00:00Z'))
    const second = await makeReadyAsset(family.id, user.id, 'tb', new Date('2026-05-01T02:00:00Z'))
    const third = await makeReadyAsset(family.id, user.id, 'tc', new Date('2026-05-01T03:00:00Z'))
    await createStoryEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        babyId: null,
        entryDate: '2026-05-01',
        body: 'story',
        assetIds: [first, second, third],
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const ids = await resolveNeighborIds(
      'timeline',
      viewer(family.id, user.id),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )

    // 스토리에 담은 순서 그대로 — 시간 역순(third, second, first)이 아니다.
    expect(ids).toEqual([first, second, third])
  })

  it('화면이 쓰는 변환과 글자 그대로 같은 순서다', async () => {
    const { user, family } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'ga', new Date('2026-05-02T01:00:00Z'))
    const b = await makeReadyAsset(family.id, user.id, 'gb', new Date('2026-05-02T02:00:00Z'))
    const loose = await makeReadyAsset(family.id, user.id, 'gc', new Date('2026-05-03T01:00:00Z'))
    await createStoryEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        babyId: null,
        entryDate: '2026-05-02',
        body: 'story',
        assetIds: [a, b],
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const { items } = await listTimeline(
      family.id,
      { limit: 500, viewerRole: 'owner', sort: 'taken', signUrls: false },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    const fromScreen = buildTimelineGroups({
      items,
      birthDate: null,
      sortMode: 'taken',
      includeStories: false,
    }).flatMap((g) => g.assets.map((x) => x.id))

    const ids = await resolveNeighborIds(
      'timeline',
      viewer(family.id, user.id),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(ids).toEqual(fromScreen)
    // 최신 날이 먼저, 그 날 안에서는 스토리 순서.
    expect(ids).toEqual([loose, a, b])
  })

  it('날짜 스코프 ctx 는 그 날 사진만 준다', async () => {
    const { user, family } = await setup()
    const onDay = await makeReadyAsset(family.id, user.id, 'da', new Date('2026-05-04T01:00:00Z'))
    const otherDay = await makeReadyAsset(
      family.id,
      user.id,
      'db',
      new Date('2026-05-05T01:00:00Z'),
    )
    const ids = await resolveNeighborIds(
      'timeline:2026-05-04',
      viewer(family.id, user.id),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(ids).toEqual([onDay])
    expect(ids).not.toContain(otherDay)
  })

  it('알 수 없는 ctx 는 전역 이웃(undefined)으로 둔다', async () => {
    const { user, family } = await setup()
    const ids = await resolveNeighborIds(
      'nonsense:1',
      viewer(family.id, user.id),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(ids).toBeUndefined()
  })
})
