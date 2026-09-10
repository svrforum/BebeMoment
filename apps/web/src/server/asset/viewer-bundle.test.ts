import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createAsset } from './create'
import { updateAssetStatus } from './update-status'
import { loadViewerBundle } from './viewer-bundle'

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

describe('loadViewerBundle', () => {
  it('returns null for unknown asset', async () => {
    const { family } = await setup()
    const media = new FakeMediaClient()
    const bundle = await loadViewerBundle(
      { assetId: '00000000-0000-0000-0000-000000000000', familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(bundle).toBeNull()
  })

  it('returns current + prev + next for middle asset', async () => {
    const { user, family } = await setup()
    const aId = await makeReadyAsset(family.id, user.id, 'a1', new Date('2026-04-01'))
    const bId = await makeReadyAsset(family.id, user.id, 'b1', new Date('2026-04-02'))
    const cId = await makeReadyAsset(family.id, user.id, 'c1', new Date('2026-04-03'))
    const media = new FakeMediaClient()
    const bundle = await loadViewerBundle(
      { assetId: bId, familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(bundle).not.toBeNull()
    expect(bundle?.current.id).toBe(bId)
    expect(bundle?.prevId).toBe(aId)
    expect(bundle?.nextId).toBe(cId)
    expect(bundle?.prev?.id).toBe(aId)
    expect(bundle?.next?.id).toBe(cId)
    expect(bundle?.prev?.urls).not.toBeNull()
    expect(bundle?.next?.urls).not.toBeNull()
    expect(media.calls.getAssetUrlsBatch.length).toBe(1)
    expect(media.calls.getAssetUrlsBatch[0]?.assetIds.sort()).toEqual([aId, cId].sort())
  })

  it('first asset has no prev', async () => {
    const { user, family } = await setup()
    const aId = await makeReadyAsset(family.id, user.id, 'a2', new Date('2026-04-01'))
    await makeReadyAsset(family.id, user.id, 'b2', new Date('2026-04-02'))
    const media = new FakeMediaClient()
    const bundle = await loadViewerBundle(
      { assetId: aId, familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(bundle?.prev).toBeNull()
    expect(bundle?.prevId).toBeUndefined()
    expect(bundle?.next).not.toBeNull()
  })

  it('last asset has no next', async () => {
    const { user, family } = await setup()
    await makeReadyAsset(family.id, user.id, 'a3', new Date('2026-04-01'))
    const bId = await makeReadyAsset(family.id, user.id, 'b3', new Date('2026-04-02'))
    const media = new FakeMediaClient()
    const bundle = await loadViewerBundle(
      { assetId: bId, familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(bundle?.prev).not.toBeNull()
    expect(bundle?.next).toBeNull()
    expect(bundle?.nextId).toBeUndefined()
  })

  it('sort=uploaded 면 prev/next 가 촬영순이 아닌 업로드(createdAt)순 이웃', async () => {
    const { user, family } = await setup()
    // 삽입(createdAt) 순서: A, B, C / 촬영(takenAt) 순서: A(01) < C(02) < B(03)
    const aId = await makeReadyAsset(family.id, user.id, 's1', new Date('2026-04-01'))
    await new Promise((r) => setTimeout(r, 8))
    const bId = await makeReadyAsset(family.id, user.id, 's2', new Date('2026-04-03'))
    await new Promise((r) => setTimeout(r, 8))
    const cId = await makeReadyAsset(family.id, user.id, 's3', new Date('2026-04-02'))
    const media = new FakeMediaClient()

    const taken = await loadViewerBundle(
      { assetId: cId, familyId: family.id, sort: 'taken' },
      db.prismaMedia,
      media,
    )
    // 촬영순: C(02) 의 이웃은 A(01)←, B(03)→
    expect(taken?.prevId).toBe(aId)
    expect(taken?.nextId).toBe(bId)

    const uploaded = await loadViewerBundle(
      { assetId: cId, familyId: family.id, sort: 'uploaded' },
      db.prismaMedia,
      new FakeMediaClient(),
    )
    // 업로드순: C 는 가장 늦게 올림 → prev=B(직전 업로드), next=없음
    expect(uploaded?.prevId).toBe(bId)
    expect(uploaded?.nextId).toBeUndefined()
  })

  it('neighborIds 가 주어지면 전역이 아니라 그 목록 안에서 prev/next 를 찾는다', async () => {
    const { user, family } = await setup()
    // 촬영순 전역 이웃과 다른 임의 컬렉션 순서를 만든다.
    const a = await makeReadyAsset(family.id, user.id, 'na', new Date('2026-04-01'))
    const b = await makeReadyAsset(family.id, user.id, 'nb', new Date('2026-04-02'))
    const c = await makeReadyAsset(family.id, user.id, 'nc', new Date('2026-04-03'))
    const d = await makeReadyAsset(family.id, user.id, 'nd', new Date('2026-04-04'))
    // 컬렉션 순서: [c, a, d] (b 제외). 전역과 같은 방향 매핑이라 a 를 열면
    // nextId=list[i-1]=c, prevId=list[i+1]=d (좌=다음/앞쪽, 우=이전/뒤쪽).
    const bundle = await loadViewerBundle(
      { assetId: a, familyId: family.id, neighborIds: [c, a, d] },
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(bundle?.nextId).toBe(c)
    expect(bundle?.prevId).toBe(d)
    // 컬렉션 밖(b)으로는 안 샘.
    expect([bundle?.prevId, bundle?.nextId]).not.toContain(b)
  })

  it('neighborIds 목록의 끝 자산은 한쪽 이웃만 있다', async () => {
    const { user, family } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'ea', new Date('2026-04-01'))
    const b = await makeReadyAsset(family.id, user.id, 'eb', new Date('2026-04-02'))
    const bundle = await loadViewerBundle(
      { assetId: b, familyId: family.id, neighborIds: [a, b] },
      db.prismaMedia,
      new FakeMediaClient(),
    )
    // b 는 목록 끝(i=1). nextId=list[0]=a, prevId=list[2]=없음.
    expect(bundle?.nextId).toBe(a)
    expect(bundle?.prevId).toBeUndefined()
  })

  it('목록 창 밖에서 열린 자산은 전역 이웃으로 되돌아간다', async () => {
    const { user, family } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'wa', new Date('2026-04-01'))
    const b = await makeReadyAsset(family.id, user.id, 'wb', new Date('2026-04-02'))
    const c = await makeReadyAsset(family.id, user.id, 'wc', new Date('2026-04-03'))
    // 타임라인 이웃 목록은 유한한 창이라, 깊이 스크롤해서 연 사진은 창 밖일 수 있다.
    // 그때 목록만 믿으면 prev/next 가 둘 다 사라져 스와이프가 죽는다 — 전역으로 폴백한다.
    const bundle = await loadViewerBundle(
      {
        assetId: a,
        familyId: family.id,
        neighborIds: [c, b],
        neighborFallbackToGlobal: true,
      },
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(bundle?.nextId).toBe(b)
    expect(bundle?.prevId).toBeUndefined()
  })

  it('경계가 있는 컬렉션은 목록 밖 자산에서 밖으로 나가지 않는다', async () => {
    const { user, family } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'ca', new Date('2026-04-01'))
    const b = await makeReadyAsset(family.id, user.id, 'cb', new Date('2026-04-02'))
    const c = await makeReadyAsset(family.id, user.id, 'cc', new Date('2026-04-03'))
    // 앨범·스토리처럼 경계가 계약인 컬렉션(fallback 미허용)에서 목록에 없는 사진을 열면
    // 이웃 없이 둔다 — 전역으로 새면 "앨범을 벗어난다"가 된다.
    const bundle = await loadViewerBundle(
      { assetId: a, familyId: family.id, neighborIds: [c, b] },
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(bundle?.nextId).toBeUndefined()
    expect(bundle?.prevId).toBeUndefined()
  })

  it('family viewer cannot open a secret-story asset, and it is excluded from global neighbors', async () => {
    const { user, family } = await setup()
    const aId = await makeReadyAsset(family.id, user.id, 'sec-a', new Date('2026-04-01'))
    const bId = await makeReadyAsset(family.id, user.id, 'sec-b', new Date('2026-04-02'))
    const cId = await makeReadyAsset(family.id, user.id, 'sec-c', new Date('2026-04-03'))
    // B is in a secret story.
    await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-02',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [bId],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    // family opening B directly → 404 (null)
    expect(
      await loadViewerBundle(
        { assetId: bId, familyId: family.id, viewerRole: 'family' },
        db.prismaMedia,
        new FakeMediaClient(),
        db.prismaPublic,
      ),
    ).toBeNull()
    // family opening A → next skips secret B, lands on C
    const fromA = await loadViewerBundle(
      { assetId: aId, familyId: family.id, viewerRole: 'family' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(fromA?.nextId).toBe(cId)
    // owner sees B normally (between A and C)
    const ownerB = await loadViewerBundle(
      { assetId: bId, familyId: family.id, viewerRole: 'owner' },
      db.prismaMedia,
      new FakeMediaClient(),
      db.prismaPublic,
    )
    expect(ownerB?.current.id).toBe(bId)
    expect(ownerB?.prevId).toBe(aId)
    expect(ownerB?.nextId).toBe(cId)
  })

  it('does not leak across families', async () => {
    const { user, family } = await setup()
    const { family: family2 } = await createFamily({ name: 'F2', userId: user.id }, db.prismaPublic)
    const aId = await makeReadyAsset(family.id, user.id, 'a4', new Date('2026-04-01'))
    // Asset in family2 with adjacent time — must NOT show up as sibling
    await makeReadyAsset(family2.id, user.id, 'b4', new Date('2026-04-02'))
    const media = new FakeMediaClient()
    const bundle = await loadViewerBundle(
      { assetId: aId, familyId: family.id },
      db.prismaMedia,
      media,
    )
    expect(bundle?.next).toBeNull()
    expect(bundle?.prev).toBeNull()
  })
})

describe('loadViewerBundle — 같은 takenAt 의 prev/next', () => {
  // 키셋 조건에 단순 상·하한(lte/gte)을 덧붙여도 같은 시각은 id 로 갈라야 한다 —
  // 세 장이 같은 시각이면 id 순으로 이웃이 정해지고 양쪽 다 빠짐이 없다.
  it('같은 시각 3장의 가운데(id 순)는 양쪽 이웃이 모두 있다', async () => {
    const { user, family } = await setup()
    const ts = new Date('2026-04-10T10:00:00Z')
    const ids = (
      await Promise.all(
        ['same1', 'same2', 'same3'].map((sha) => makeReadyAsset(family.id, user.id, sha, ts)),
      )
    ).sort()
    const [low, mid, high] = ids as [string, string, string]
    const bundle = await loadViewerBundle(
      { assetId: mid, familyId: family.id },
      db.prismaMedia,
      new FakeMediaClient(),
    )
    // 정렬은 (takenAt desc, id desc): prev = 더 작은 id, next = 더 큰 id.
    expect(bundle?.prevId).toBe(low)
    expect(bundle?.nextId).toBe(high)

    await db.prismaMedia.asset.updateMany({
      where: { id: { in: ids }, familyId: family.id },
      data: { createdAt: ts },
    })
    const uploaded = await loadViewerBundle(
      { assetId: mid, familyId: family.id, sort: 'uploaded' },
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(uploaded?.prevId).toBe(low)
    expect(uploaded?.nextId).toBe(high)
  })
})
