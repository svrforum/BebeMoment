import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { listMemories } from './list'

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
    expect(groups[0]?.label).toBe('1년 전 오늘')
    expect(groups[1]?.stories).toHaveLength(1)
  })
})
