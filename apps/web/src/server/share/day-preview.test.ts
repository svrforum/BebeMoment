import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { buildDayPreview, getDayStories, orderDayAssetIds } from './day-preview'

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

const DAY = '2026-04-01'

let counter = 0
async function makeReadyAsset(familyId: string, userId: string, takenAt: string) {
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
  const { user } = await signup(
    { username: `o${counter}${Date.now()}`, password: 'password123', displayName: 'O' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'Fam', userId: user.id }, db.prismaPublic)
  return { user, family }
}

async function story(
  familyId: string,
  userId: string,
  assetIds: string[],
  opts: { visibility?: 'family' | 'guardians'; title?: string } = {},
) {
  return createStoryEntry(
    {
      familyId,
      babyId: null,
      entryDate: DAY,
      title: opts.title ?? 'T',
      body: 'B',
      visibility: opts.visibility ?? 'family',
      assetIds,
      byUserId: userId,
    },
    db.prismaPublic,
    db.prismaMedia,
  )
}

describe('getDayStories', () => {
  it('returns family-visible stories anchored to a photo taken that day, oldest first', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, `${DAY}T09:00:00.000Z`)
    const a2 = await makeReadyAsset(family.id, user.id, `${DAY}T10:00:00.000Z`)
    const other = await makeReadyAsset(family.id, user.id, '2026-04-02T09:00:00.000Z')
    const first = await story(family.id, user.id, [a1], { title: 'first' })
    const second = await story(family.id, user.id, [a2], { title: 'second' })
    await story(family.id, user.id, [other], { title: 'other-day' })

    const out = await getDayStories(DAY, family.id, db.prismaPublic, db.prismaMedia)
    expect(out.map((s) => s.id)).toEqual([first.id, second.id])
    expect(out[0]).toMatchObject({ title: 'first', body: 'B', publicNo: first.publicNo })
  })

  it('hides guardians-only and deleted stories', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, `${DAY}T09:00:00.000Z`)
    const a2 = await makeReadyAsset(family.id, user.id, `${DAY}T10:00:00.000Z`)
    const a3 = await makeReadyAsset(family.id, user.id, `${DAY}T11:00:00.000Z`)
    await story(family.id, user.id, [a1], { visibility: 'guardians' })
    const gone = await story(family.id, user.id, [a2])
    await db.prismaPublic.story.update({
      where: { id: gone.id, familyId: family.id },
      data: { deletedAt: new Date() },
    })
    const kept = await story(family.id, user.id, [a3])

    const out = await getDayStories(DAY, family.id, db.prismaPublic, db.prismaMedia)
    expect(out.map((s) => s.id)).toEqual([kept.id])
  })

  it('lists a story once even when several of its photos fall on the day, keeping story order', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, `${DAY}T09:00:00.000Z`)
    const a2 = await makeReadyAsset(family.id, user.id, `${DAY}T10:00:00.000Z`)
    const s = await story(family.id, user.id, [a2, a1])

    const out = await getDayStories(DAY, family.id, db.prismaPublic, db.prismaMedia)
    expect(out.map((x) => x.id)).toEqual([s.id])
    expect(out[0]?.assetIds).toEqual([a2, a1])
  })
})

describe('orderDayAssetIds', () => {
  it('keeps chronological order but puts a story photos in the arranged order at its first slot', () => {
    const out = orderDayAssetIds(
      ['a', 'b', 'c', 'd'],
      [{ id: 's', publicNo: 1, title: null, body: '', assetIds: ['c', 'b'] }],
    )
    expect(out).toEqual(['a', 'c', 'b', 'd'])
  })
})

describe('buildDayPreview', () => {
  it('includes photos uploaded after the link was made (dynamic) and a cover per story', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, `${DAY}T09:00:00.000Z`)
    const a2 = await makeReadyAsset(family.id, user.id, `${DAY}T10:00:00.000Z`)
    const s = await story(family.id, user.id, [a2, a1])
    const media = new FakeMediaClient()
    const urls = {
      blurhash: null,
      dominantColor: null,
      aspectRatio: null,
      thumb256: null,
      thumb512: null,
      display1080: {
        avif: '/media/v1/files/a2.avif',
        webp: '/media/v1/files/a2.webp',
        jpeg: '/media/v1/files/a2.jpg',
      },
      original: null,
      videoPoster: null,
      videoCompat: null,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }
    media.setUrlsForAsset(a2, urls)

    const out = await buildDayPreview(
      DAY,
      family.id,
      'https://h',
      db.prismaPublic,
      db.prismaMedia,
      media,
    )
    expect(out?.photos.ids).toEqual([a2, a1])
    expect(out?.stories).toEqual([
      {
        id: s.id,
        publicNo: s.publicNo,
        title: 'T',
        body: 'B',
        coverUrl: 'https://h/media/v1/files/a2.jpg',
      },
    ])
  })

  it('a story whose photos are all hidden does not appear', async () => {
    const { user, family } = await setup()
    const a1 = await makeReadyAsset(family.id, user.id, `${DAY}T09:00:00.000Z`)
    const a2 = await makeReadyAsset(family.id, user.id, `${DAY}T10:00:00.000Z`)
    await story(family.id, user.id, [a1])
    // a1 은 비밀 스토리에도 속하므로 공개 프리뷰에서 사진째 빠진다(Rule A).
    await story(family.id, user.id, [a1], { visibility: 'guardians' })
    const out = await buildDayPreview(
      DAY,
      family.id,
      'https://h',
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(out?.photos.ids).toEqual([a2])
    expect(out?.stories).toEqual([])
  })
})
