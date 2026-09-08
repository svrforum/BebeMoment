import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { listMemories, listMemoryGroupsForCount, memoryDayWindows } from './list'

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
    {
      username: `u${Date.now()}${Math.floor(Math.random() * 1e6)}`,
      password: 'password123',
      displayName: 'T',
    },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  return { user, family }
}

let shaSeq = 0
async function makeAsset(
  familyId: string,
  userId: string,
  takenAt: Date,
  opts: { deleted?: boolean } = {},
) {
  const sha = `mem${shaSeq++}`.padEnd(64, '0')
  const a = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${sha}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: BigInt(1),
      sha256: sha,
      takenAt,
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({
    where: { id: a.id },
    data: { status: 'ready', ...(opts.deleted ? { deletedAt: new Date() } : {}) },
  })
  return a
}

async function makeStory(familyId: string, userId: string, entryDate: string, body: string) {
  return db.prismaPublic.story.create({
    data: {
      familyId,
      createdByUserId: userId,
      entryDate: new Date(`${entryDate}T00:00:00Z`),
      body,
    },
  })
}

const TODAY = new Date('2026-05-30T00:00:00Z')

describe('listMemories', () => {
  it('빈 결과', async () => {
    const { family } = await setup()
    const groups = await listMemories(
      { familyId: family.id, today: TODAY, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(groups).toEqual([])
  })

  it('연 단위·월 단위 추억을 간격별로 묶고 먼 과거 먼저 정렬', async () => {
    const { user, family } = await setup()
    // 1년 전 같은 날: asset 2장
    await makeAsset(family.id, user.id, new Date('2025-05-30T10:00:00Z'))
    await makeAsset(family.id, user.id, new Date('2025-05-30T12:00:00Z'))
    // 6개월 전 같은 날: story 1개
    await makeStory(family.id, user.id, '2025-11-30', '여섯 달 전')
    // 제외: 같은 달이지만 일(日)이 다름
    await makeAsset(family.id, user.id, new Date('2025-05-29T10:00:00Z'))
    // 제외: 삭제된 자산(추억 날짜에 있지만)
    await makeAsset(family.id, user.id, new Date('2025-05-30T09:00:00Z'), { deleted: true })

    const groups = await listMemories(
      { familyId: family.id, today: TODAY, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )

    expect(groups.map((g) => g.interval)).toEqual([
      { kind: 'year', n: 1 },
      { kind: 'month', n: 6 },
    ])
    expect(groups[0]?.assets).toHaveLength(2)
    expect(groups[1]?.stories).toHaveLength(1)
  })

  it('listMemoryGroupsForCount: 미디어 클라이언트 없이 같은 그룹 개수를 낸다', async () => {
    const { user, family } = await setup()
    await makeAsset(family.id, user.id, new Date('2025-05-30T10:00:00Z'))
    await makeAsset(family.id, user.id, new Date('2025-05-30T12:00:00Z'))
    await makeStory(family.id, user.id, '2025-11-30', '여섯 달 전')

    const groups = await listMemoryGroupsForCount(
      { familyId: family.id, today: TODAY, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
    )
    expect(groups.map((g) => g.interval)).toEqual([
      { kind: 'year', n: 1 },
      { kind: 'month', n: 6 },
    ])
    expect(groups[0]?.assets).toHaveLength(2)
    expect(groups[0]?.assets[0]?.urls).toBeNull()
    expect(groups[1]?.stories).toHaveLength(1)
  })

  it('비밀 스토리 단독 사진은 family 에게 숨기고 owner 에겐 보인다', async () => {
    const { user, family } = await setup()
    const normal = await makeAsset(family.id, user.id, new Date('2025-05-30T10:00:00Z'))
    const secret = await makeAsset(family.id, user.id, new Date('2025-05-30T11:00:00Z'))
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2025-05-30',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [secret.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const familyGroups = await listMemories(
      { familyId: family.id, today: TODAY, viewerRole: 'family' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    const familyAssetIds = familyGroups.flatMap((g) => g.assets.map((a) => a.id))
    expect(familyAssetIds).toContain(normal.id)
    expect(familyAssetIds).not.toContain(secret.id)
    // 비밀 스토리 카드 자체도 family 에겐 안 뜬다.
    expect(familyGroups.flatMap((g) => g.stories)).toHaveLength(0)

    const ownerGroups = await listMemories(
      { familyId: family.id, today: TODAY, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    const ownerStoryAssetIds = ownerGroups.flatMap((g) =>
      g.stories.flatMap((s) => s.assets.map((ea) => ea.asset?.id)),
    )
    expect(ownerStoryAssetIds).toContain(secret.id)
  })

  it('31일: 31일이 없는 달은 건너뛰고 있는 달만 추억', async () => {
    const { user, family } = await setup()
    const today = new Date('2026-05-31T00:00:00Z')
    const twoMonths = await makeAsset(family.id, user.id, new Date('2026-03-31T09:00:00Z'))
    const oneYear = await makeAsset(family.id, user.id, new Date('2025-05-31T09:00:00Z'))
    // 4월엔 31일이 없다 — 4/30 은 추억이 아니다.
    await makeAsset(family.id, user.id, new Date('2026-04-30T09:00:00Z'))
    await makeStory(family.id, user.id, '2026-01-31', '넉 달 전')

    const groups = await listMemories(
      { familyId: family.id, today, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(groups.map((g) => g.interval)).toEqual([
      { kind: 'year', n: 1 },
      { kind: 'month', n: 4 },
      { kind: 'month', n: 2 },
    ])
    expect(groups[0]?.assets.map((a) => a.id)).toEqual([oneYear.id])
    expect(groups[1]?.stories).toHaveLength(1)
    expect(groups[2]?.assets.map((a) => a.id)).toEqual([twoMonths.id])
  })

  it('2월 29일: 윤년의 2/29 만 연 단위 추억, 2/28 은 아니다', async () => {
    const { user, family } = await setup()
    const today = new Date('2028-02-29T00:00:00Z')
    const leap = await makeAsset(family.id, user.id, new Date('2024-02-29T09:00:00Z'))
    const oneMonth = await makeAsset(family.id, user.id, new Date('2028-01-29T09:00:00Z'))
    await makeAsset(family.id, user.id, new Date('2027-02-28T09:00:00Z'))

    const groups = await listMemories(
      { familyId: family.id, today, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(groups.map((g) => g.interval)).toEqual([
      { kind: 'year', n: 4 },
      { kind: 'month', n: 1 },
    ])
    expect(groups[0]?.assets.map((a) => a.id)).toEqual([leap.id])
    expect(groups[1]?.assets.map((a) => a.id)).toEqual([oneMonth.id])
  })

  it('가장 오래된 사진이 최근이면 빈 결과(과거 달 창이 없다)', async () => {
    const { user, family } = await setup()
    await makeAsset(family.id, user.id, new Date('2026-05-20T09:00:00Z'))
    await makeAsset(family.id, user.id, new Date('2026-05-30T09:00:00Z'))
    const groups = await listMemories(
      { familyId: family.id, today: TODAY, viewerRole: 'owner' },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(groups).toEqual([])
  })

  it('signLimit: 그룹당 앞 N장만 서명하고 나머지는 urls=null 로 싣는다', async () => {
    const { user, family } = await setup()
    for (let h = 0; h < 5; h += 1) {
      await makeAsset(family.id, user.id, new Date(`2025-05-30T1${h}:00:00Z`))
    }
    // 스토리 사진 자체는 추억 날짜가 아니게(11/15) — 단독 사진으로 서명 대상이 되면 안 된다.
    const storyAsset = await makeAsset(family.id, user.id, new Date('2025-11-15T10:00:00Z'))
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2025-11-30',
        body: 'story',
        assetIds: [storyAsset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const media = new FakeMediaClient()
    const groups = await listMemories(
      { familyId: family.id, today: TODAY, viewerRole: 'owner', signLimit: 2 },
      db.prismaMedia,
      db.prismaPublic,
      media,
    )
    expect(groups[0]?.assets).toHaveLength(5)
    expect(groups[0]?.assets.filter((a) => a.urls !== null)).toHaveLength(2)
    expect(media.calls.getAssetUrlsBatch).toHaveLength(1)
    expect(media.calls.getAssetUrlsBatch[0]?.assetIds).toHaveLength(2)
    // 스토리 사진은 카드·위젯이 안 쓰므로 제한 모드에선 서명하지 않는다.
    expect(groups[1]?.stories[0]?.assets[0]?.asset?.urls).toBeNull()
  })
})

describe('memoryDayWindows', () => {
  it('오늘과 같은 일(日)의 과거 달 하루 창을 earliest 달까지만 만든다', () => {
    const windows = memoryDayWindows(
      new Date('2026-05-30T00:00:00Z'),
      new Date('2026-02-10T00:00:00Z'),
    )
    expect(windows.map((w) => w.gte.toISOString().slice(0, 10))).toEqual([
      '2026-04-30',
      '2026-03-30',
      // 2월엔 30일이 없다 — 창 없음. earliest(2/10)가 속한 2월까지 보고 멈춘다.
    ])
    expect(windows[0]?.lt.toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })

  it('earliest 가 이번 달이면 창이 없다', () => {
    expect(
      memoryDayWindows(new Date('2026-05-30T00:00:00Z'), new Date('2026-05-02T00:00:00Z')),
    ).toEqual([])
  })
})
