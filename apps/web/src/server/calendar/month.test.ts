import { createAsset, updateAssetStatus } from '@/test-support/asset-fixtures'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createScheduleEntry } from '../schedule/entry'
import { createStoryEntry } from '../story/create'
import { loadCalendarMonth } from './month'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.scheduleEntry.deleteMany()
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

async function makeReady(familyId: string, userId: string, sha: string, takenAt: Date) {
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

describe('loadCalendarMonth', () => {
  it('해당 달 사진만 조달하고 다른 달은 제외한다(전역 캡 없음)', async () => {
    const { user, family } = await setup()
    const mayId = await makeReady(family.id, user.id, 'may', new Date('2026-05-10T12:00:00Z'))
    await makeReady(family.id, user.id, 'apr', new Date('2026-04-10T12:00:00Z'))
    await makeReady(family.id, user.id, 'jun', new Date('2026-06-10T12:00:00Z'))

    const data = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'owner', schedule: true }, // month 4 = May (0-based)
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(data.assets.map((a) => a.id)).toEqual([mayId])
  })

  it('비밀 스토리 사진은 family 에게 캘린더에서 숨기고 owner 에겐 보인다', async () => {
    const { user, family } = await setup()
    const normalId = await makeReady(
      family.id,
      user.id,
      'cnormal',
      new Date('2026-05-10T12:00:00Z'),
    )
    const secretId = await makeReady(
      family.id,
      user.id,
      'csecret',
      new Date('2026-05-20T12:00:00Z'),
    )
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-05-20',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [secretId],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )

    const familyView = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'family', schedule: true },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(familyView.assets.map((a) => a.id)).toEqual([normalId])
    expect(familyView.storyDays).toEqual([])

    const ownerView = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'owner', schedule: true },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(ownerView.assets.map((a) => a.id)).toContain(secretId)
  })

  it('날짜 시트가 그리는 만큼(하루 최신 6장)만 URL 을 사인한다', async () => {
    const { user, family } = await setup()
    const day10: string[] = []
    for (let h = 1; h <= 7; h++) {
      day10.push(
        await makeReady(
          family.id,
          user.id,
          `d10-${h}`,
          new Date(`2026-05-10T${String(h).padStart(2, '0')}:00:00Z`),
        ),
      )
    }
    const day11 = await makeReady(family.id, user.id, 'd11', new Date('2026-05-11T09:00:00Z'))
    const media = new FakeMediaClient()
    const data = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'owner', schedule: true },
      db.prismaMedia,
      db.prismaPublic,
      media,
    )
    expect(data.assets).toHaveLength(8)
    // 10일은 최신 6장(7시~2시), 가장 이른 1시 사진은 시트에 안 그려지므로 사인하지 않는다.
    const signed = media.calls.getAssetUrlsBatch[0]?.assetIds ?? []
    expect([...signed].sort()).toEqual([day11, ...day10.slice(1)].sort())
  })

  it('일정 기능이 꺼져 있으면 일정을 싣지 않는다', async () => {
    const { user, family } = await setup()
    await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '예방접종', onDate: '2026-05-10' },
      db.prismaPublic,
    )
    const data = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'owner', schedule: false },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(data.scheduleDays).toEqual([])
    expect(data.scheduleEntries).toEqual([])
  })

  it('그 달의 일정을 같은 페이로드에 싣는다', async () => {
    const { user, family } = await setup()
    await createScheduleEntry(
      { familyId: family.id, byUserId: user.id, title: '예방접종', onDate: '2026-05-10' },
      db.prismaPublic,
    )
    const data = await loadCalendarMonth(
      { familyId: family.id, year: 2026, month: 4, viewerRole: 'owner', schedule: true },
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(data.scheduleDays).toEqual([{ day: '2026-05-10', total: 1, remaining: 1 }])
    expect(data.scheduleEntries.map((e) => e.title)).toEqual(['예방접종'])
  })
})
