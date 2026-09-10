import { buildTimelineGroups } from '@/server/timeline/build-groups'
import { listTimeline } from '@/server/timeline/merged-list'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createAsset } from './create'
import { timelineNeighborIds } from './timeline-neighbors'
import { updateAssetStatus } from './update-status'

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

async function makeAsset(
  familyId: string,
  userId: string,
  sha: string,
  takenAt: Date,
  status: 'ready' | 'failed' = 'ready',
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
  await updateAssetStatus({ assetId: a.id, familyId, status }, db.prismaMedia)
  return a.id
}

/** 화면이 하는 그대로 — 페이지마다 변환을 태우고 평평하게 이어붙인다. */
async function screenOrder(
  familyId: string,
  pageSizes: { first: number; next: number },
): Promise<string[]> {
  const out: string[] = []
  let cursor: string | undefined
  let page = 0
  for (;;) {
    const { items, nextCursor } = await listTimeline(
      familyId,
      {
        limit: page === 0 ? pageSizes.first : pageSizes.next,
        viewerRole: 'owner',
        sort: 'taken',
        signUrls: false,
        ...(cursor ? { cursor } : {}),
      },
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    for (const g of buildTimelineGroups({
      items,
      birthDate: null,
      sortMode: 'taken',
      includeStories: false,
    })) {
      for (const a of g.assets) if (a.status === 'ready') out.push(a.id)
    }
    page++
    if (!nextCursor) return out
    cursor = nextCursor
  }
}

const base = (familyId: string, assetId: string) =>
  ({ assetId, familyId, viewerRole: 'owner' as const, sort: 'taken' as const }) as const

describe('timelineNeighborIds', () => {
  it('페이지 경계를 넘는 스토리도 화면과 같은 순서로 이어붙인다', async () => {
    const { user, family } = await setup()
    // 같은 날 네 장을 한 스토리에 시간 오름차순으로 담는다.
    const p1 = await makeAsset(family.id, user.id, 'pa', new Date('2026-06-01T01:00:00Z'))
    const p2 = await makeAsset(family.id, user.id, 'pb', new Date('2026-06-01T02:00:00Z'))
    const p3 = await makeAsset(family.id, user.id, 'pc', new Date('2026-06-01T03:00:00Z'))
    const p4 = await makeAsset(family.id, user.id, 'pd', new Date('2026-06-01T04:00:00Z'))
    await createStoryEntry(
      {
        familyId: family.id,
        byUserId: user.id,
        babyId: null,
        entryDate: '2026-06-01',
        body: 's',
        assetIds: [p1, p2, p3, p4],
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    // 화면이 2장 + 2장으로 받는 상황을 그대로 재현한다. applyStoryOrder 는 한 페이지
    // 안에서만 재배치하므로, 한 번에 다 받아 정렬하면 이 순서와 어긋난다.
    const pageSizes = { first: 2, next: 2 }
    const expected = await screenOrder(family.id, pageSizes)
    const ids = await timelineNeighborIds(
      base(family.id, p1),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
      { pageSizes },
    )
    expect(ids).toEqual(expected)
    // 한 페이지로 다 받았을 때의 순서와는 실제로 다르다 — 이 테스트가 지키려는 지점.
    const oneShot = await screenOrder(family.id, { first: 100, next: 100 })
    expect(expected).not.toEqual(oneShot)
    expect(new Set(ids)).toEqual(new Set([p1, p2, p3, p4]))
  })

  it('열 수 없는 실패 자산은 이웃에서 뺀다', async () => {
    const { user, family } = await setup()
    const ok1 = await makeAsset(family.id, user.id, 'fa', new Date('2026-06-02T01:00:00Z'))
    const bad = await makeAsset(
      family.id,
      user.id,
      'fb',
      new Date('2026-06-02T02:00:00Z'),
      'failed',
    )
    const ok2 = await makeAsset(family.id, user.id, 'fc', new Date('2026-06-02T03:00:00Z'))
    const ids = await timelineNeighborIds(
      base(family.id, ok2),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(ids).toEqual([ok2, ok1])
    expect(ids).not.toContain(bad)
  })

  it('상한 안에서 못 찾으면 undefined — 전역 이웃에 맡긴다', async () => {
    const { user, family } = await setup()
    await makeAsset(family.id, user.id, 'ma', new Date('2026-06-03T01:00:00Z'))
    const deep = await makeAsset(family.id, user.id, 'mb', new Date('2026-06-03T02:00:00Z'))
    const ids = await timelineNeighborIds(
      base(family.id, deep),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
      { pageSizes: { first: 1, next: 1 }, maxItems: 1 },
    )
    expect(ids).toBeUndefined()
  })

  it('대상 뒤 한 장이 잡히면 더 파고들지 않는다', async () => {
    const { user, family } = await setup()
    const newest = await makeAsset(family.id, user.id, 'sa', new Date('2026-06-04T03:00:00Z'))
    const mid = await makeAsset(family.id, user.id, 'sb', new Date('2026-06-04T02:00:00Z'))
    await makeAsset(family.id, user.id, 'sc', new Date('2026-06-04T01:00:00Z'))
    const ids = await timelineNeighborIds(
      base(family.id, newest),
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
      { pageSizes: { first: 2, next: 2 } },
    )
    // 첫 페이지에서 newest 와 그 뒤 한 장이 잡혔으므로 두 번째 페이지는 안 받는다.
    expect(ids).toEqual([newest, mid])
  })
})
