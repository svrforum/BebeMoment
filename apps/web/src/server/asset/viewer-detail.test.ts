import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAsset } from './create'
import { loadViewerDetail } from './viewer-detail'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.widgetPhoto.deleteMany()
  await db.prismaPublic.assetBookmark.deleteMany()
  await db.prismaPublic.assetLike.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.baby.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let seq = 0
async function setup(name = 'F') {
  const { user } = await signup(
    { username: `vd${seq++}${Date.now()}`, password: 'password123', displayName: 'T' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name, userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function makeAsset(familyId: string, userId: string) {
  const sha = `v${seq++}`.padEnd(64, '0')
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
      takenAt: new Date('2026-06-01T00:00:00Z'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('loadViewerDetail', () => {
  it('내 반응 상태를 함께 돌려준다', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id)
    await db.prismaPublic.assetLike.create({
      data: { assetId: a.id, userId: user.id, familyId: family.id },
    })
    await db.prismaPublic.widgetPhoto.create({
      data: { assetId: a.id, userId: user.id, familyId: family.id },
    })

    const out = await loadViewerDetail(
      { assetId: a.id, familyId: family.id, userId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(out?.liked).toBe(true)
    expect(out?.inWidget).toBe(true)
    expect(out?.bookmarked).toBe(false)
    expect(out?.asset.originalFilename).toBe('x.jpg')
    expect(out?.likers.count).toBe(1)
  })

  it('자산 행을 미리 넘기면 다시 읽지 않는다', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id)
    const row = await db.prismaMedia.asset.findFirstOrThrow({
      where: { id: a.id, familyId: family.id },
    })
    const ops: string[] = []
    const counting = db.prismaMedia.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            ops.push(`${model}.${operation}`)
            return query(args)
          },
        },
      },
    }) as unknown as typeof db.prismaMedia
    const out = await loadViewerDetail(
      { assetId: a.id, familyId: family.id, userId: user.id, asset: row },
      db.prismaPublic,
      counting,
    )
    expect(out?.asset.id).toBe(a.id)
    expect(ops).toEqual(['AssetBaby.findMany'])
  })

  it('미리 넘긴 행이 요청과 안 맞으면 무시하고 직접 읽는다', async () => {
    const { user, family } = await setup()
    const { family: other } = await setup('G')
    const a = await makeAsset(family.id, user.id)
    const row = await db.prismaMedia.asset.findFirstOrThrow({
      where: { id: a.id, familyId: family.id },
    })
    // 다른 가족 id 로 물으면 넘긴 행은 무관 — 그 가족엔 없으니 null.
    const out = await loadViewerDetail(
      { assetId: a.id, familyId: other.id, userId: user.id, asset: row },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(out).toBeNull()
  })

  it('다른 가족의 자산은 못 읽는다', async () => {
    const mine = await setup('A')
    const other = await setup('B')
    const foreign = await makeAsset(other.family.id, other.user.id)

    const out = await loadViewerDetail(
      { assetId: foreign.id, familyId: mine.family.id, userId: mine.user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(out).toBeNull()
  })

  it('연결된 아기 이름을 붙여준다', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id)
    const baby = await db.prismaPublic.baby.create({
      data: { familyId: family.id, name: '루키', birthDate: new Date('2026-01-01T00:00:00Z') },
    })
    await db.prismaMedia.assetBaby.create({
      data: { assetId: a.id, babyId: baby.id, taggedByUserId: user.id },
    })

    const out = await loadViewerDetail(
      { assetId: a.id, familyId: family.id, userId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(out?.babies).toEqual([{ id: baby.id, name: '루키' }])
  })

  it('삭제된 자산은 없는 것으로 본다', async () => {
    const { user, family } = await setup()
    const a = await makeAsset(family.id, user.id)
    await db.prismaMedia.asset.update({
      where: { id: a.id, familyId: family.id },
      data: { deletedAt: new Date() },
    })

    const out = await loadViewerDetail(
      { assetId: a.id, familyId: family.id, userId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(out).toBeNull()
  })
})
