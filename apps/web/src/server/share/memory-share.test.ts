import { createAsset, updateAssetStatus } from '@/test-support/asset-fixtures'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { createShareLink } from './create'
import { listMyShareLinks, listShareLinks } from './manage'
import { buildMemoryPreview } from './memory-preview'
import { resolveShareLink } from './resolve'

/**
 * 추억 링크 = 날짜 + 그때 고정한 사진 목록. 받은 사람은 그 사진 전부와, 그 사진이 담긴 스토리의
 * 글을 본다. '이 날 공유'(날짜만 — 대표 사진과 글, 나중 업로드가 따라 들어옴)와 같은 열을 쓰지만
 * 사진 목록이 딸려 있는지로 갈린다.
 */

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.shareLink.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

const DAY = '2026-04-01'
let counter = 0
async function photo(familyId: string, userId: string, takenAt = `${DAY}T10:00:00.000Z`) {
  counter += 1
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey: `k-${counter}`,
      originalFilename: 'x.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256: counter.toString(16).padStart(64, '0'),
      takenAt: new Date(takenAt),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset.id
}

async function setup() {
  counter += 1
  const { user } = await signup(
    { username: `owner${counter}`, password: 'password123', displayName: 'O' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'Fam', userId: user.id }, db.prismaPublic)
  return { user, family }
}

type Ctx = Awaited<ReturnType<typeof setup>>
const memoryLink = (c: Ctx, assetIds: string[], date = DAY) =>
  createShareLink(
    {
      target: { kind: 'memory', date, assetIds },
      familyId: c.family.id,
      userId: c.user.id,
      ttl: '1d',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
const story = (
  c: Ctx,
  assetIds: string[],
  body: string,
  visibility: 'family' | 'guardians' = 'family',
) =>
  createStoryEntry(
    {
      familyId: c.family.id,
      babyId: null,
      entryDate: '2026-05-20',
      body,
      visibility,
      assetIds,
      byUserId: c.user.id,
    },
    db.prismaPublic,
    db.prismaMedia,
  )
// 기본은 '지금 막 만든 링크' — 이미 있는 스토리는 모두 링크보다 먼저다.
const preview = (c: Ctx, assetIds: string[], madeAt = new Date(Date.now() + 60_000)) =>
  buildMemoryPreview(
    assetIds,
    madeAt,
    c.family.id,
    'https://h',
    db.prismaPublic,
    db.prismaMedia,
    new FakeMediaClient(),
  )

describe('memory share link', () => {
  it('stores the date and the photo list, and resolves back to both in the given order', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    const b = await photo(c.family.id, c.user.id)
    const { token } = await memoryLink(c, [b, a])
    const r = await resolveShareLink(token, db.prismaPublic)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.target).toEqual({ kind: 'memory', date: DAY, assetIds: [b, a] })
  })

  it('keeps only photos taken on that day', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    const other = await photo(c.family.id, c.user.id, '2026-04-02T00:30:00.000Z')
    const { token } = await memoryLink(c, [other, a])
    const r = await resolveShareLink(token, db.prismaPublic)
    expect(r.status === 'ok' && r.target).toEqual({ kind: 'memory', date: DAY, assetIds: [a] })
  })

  it('refuses a memory that has no photo of that day', async () => {
    const c = await setup()
    const other = await photo(c.family.id, c.user.id, '2026-04-02T00:30:00.000Z')
    await expect(memoryLink(c, [other])).rejects.toMatchObject({ status: 404 })
    expect(await db.prismaPublic.shareLink.count({ where: { familyId: c.family.id } })).toBe(0)
  })

  // 같은 날짜 열을 쓰지만 서로 다른 링크다 — 한쪽 시트에서 다른 쪽이 보이면 엉뚱한 링크를 거두게 된다.
  it('a day link and a memory link of the same date stay out of each other’s list', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    const memory = await memoryLink(c, [a])
    const day = await createShareLink(
      { target: { kind: 'date', date: DAY }, familyId: c.family.id, userId: c.user.id, ttl: '1d' },
      db.prismaPublic,
      db.prismaMedia,
    )
    const tokens = async (target: Parameters<typeof listShareLinks>[0]) =>
      (await listShareLinks(target, c.family.id, db.prismaPublic)).map((l) => l.token)
    expect(await tokens({ kind: 'date', date: DAY })).toEqual([day.token])
    expect(await tokens({ kind: 'memory', date: DAY, assetIds: [] })).toEqual([memory.token])

    const r = await resolveShareLink(day.token, db.prismaPublic)
    expect(r.status === 'ok' && r.target).toEqual({ kind: 'date', date: DAY })
  })

  it('shows up in the inventory as its own kind', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    const memory = await memoryLink(c, [a])
    const day = await createShareLink(
      { target: { kind: 'date', date: DAY }, familyId: c.family.id, userId: c.user.id, ttl: '1d' },
      db.prismaPublic,
      db.prismaMedia,
    )
    const mine = await listMyShareLinks(c.family.id, c.user.id, db.prismaPublic)
    expect(mine.find((l) => l.token === memory.token)).toMatchObject({
      kind: 'memory',
      target: DAY,
    })
    expect(mine.find((l) => l.token === day.token)).toMatchObject({ kind: 'date', target: DAY })
  })
})

describe('buildMemoryPreview', () => {
  it('puts a story’s text with its photos and leaves the rest loose', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    const b = await photo(c.family.id, c.user.id)
    const d = await photo(c.family.id, c.user.id)
    const s = await story(c, [b], '처음 뒤집은 날')
    const p = await preview(c, [a, b, d])
    expect(p?.photos.total).toBe(3)
    expect(p?.stories.map((x) => ({ id: x.id, body: x.body, photos: x.items.length }))).toEqual([
      { id: s.id, body: '처음 뒤집은 날', photos: 1 },
    ])
    expect(p?.loose).toHaveLength(2)
  })

  it('shows neither the text nor the photos of a guardians-only story', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    const hidden = await photo(c.family.id, c.user.id)
    await story(c, [hidden], '보호자만 보는 글', 'guardians')
    const p = await preview(c, [a, hidden])
    expect(p?.stories).toEqual([])
    expect(p?.photos.ids).toEqual([a])
    expect(p?.loose).toHaveLength(1)
  })

  // 링크는 만든 순간의 사진으로 고정이다 — 스토리에 같은 날 사진이 더 있어도 링크에 없으면 안 보인다.
  it('does not pull in a story photo that the link does not carry', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    const later = await photo(c.family.id, c.user.id)
    await story(c, [a, later], '글')
    const p = await preview(c, [a])
    expect(p?.photos.ids).toEqual([a])
    expect(p?.stories[0]?.items).toHaveLength(1)
    expect(p?.loose).toEqual([])
  })

  // 사진처럼 스토리도 링크를 만든 순간의 것만 — 나중에 그 사진으로 쓴 글이 예전에 보낸 링크에
  // 따라 나오면, 아무도 내보내기로 정하지 않은 글이 공개된다.
  it('leaves out a story written after the link was made', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    await story(c, [a], '링크보다 먼저 쓴 글')
    const { token } = await memoryLink(c, [a])
    const link = await resolveShareLink(token, db.prismaPublic)
    if (link.status !== 'ok') throw new Error('link did not resolve')
    const b = await photo(c.family.id, c.user.id)
    await story(c, [a, b], '링크 뒤에 쓴 글')
    const p = await preview(c, [a], link.createdAt)
    expect(p?.stories.map((x) => x.body)).toEqual(['링크보다 먼저 쓴 글'])
  })

  it('counts a photo once when two stories hold it', async () => {
    const c = await setup()
    const a = await photo(c.family.id, c.user.id)
    await story(c, [a], '첫 글')
    await story(c, [a], '둘째 글')
    const p = await preview(c, [a])
    expect(p?.stories.map((x) => x.body)).toEqual(['첫 글'])
    expect(p?.loose).toEqual([])
  })
})
