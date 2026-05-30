import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { getWidgetData } from './data'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.baby.deleteMany()
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
async function makeAsset(familyId: string, userId: string, takenAt: Date) {
  const sha = `w${shaSeq++}`.padEnd(64, '0')
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
  await db.prismaMedia.asset.update({ where: { id: a.id }, data: { status: 'ready' } })
  return a
}

describe('getWidgetData', () => {
  it('멤버십 없으면 null', async () => {
    const { user } = await setup()
    await db.prismaPublic.membership.deleteMany()
    const data = await getWidgetData(
      user.id,
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(data).toBeNull()
  })

  it('최신 사진 + 아기 이름·생일 반환', async () => {
    const { user, family } = await setup()
    await db.prismaPublic.baby.create({
      data: { familyId: family.id, name: '루키', birthDate: new Date('2026-01-15T00:00:00Z') },
    })
    await makeAsset(family.id, user.id, new Date('2026-05-01T00:00:00Z'))
    const newest = await makeAsset(family.id, user.id, new Date('2026-05-29T00:00:00Z'))

    const media = new FakeMediaClient()
    media.setUrlsForAsset(newest.id, {
      blurhash: null,
      dominantColor: null,
      aspectRatio: 1,
      thumb256: null,
      thumb512: null,
      display1080: {
        avif: 'https://m/display.avif',
        webp: 'https://m/display.webp',
        jpeg: 'https://m/display.jpg',
      },
      original: null,
      videoPoster: null,
      videoCompat: null,
      expiresAt: '2026-05-30T00:00:00Z',
    })

    const data = await getWidgetData(user.id, db.prismaMedia, db.prismaPublic, media)
    expect(data?.hasPhoto).toBe(true)
    expect(data?.photoUrl).toBeTruthy()
    expect(typeof data?.photoUrl).toBe('string')
    expect(data?.babyName).toBe('루키')
    expect(data?.birthDate).toBe('2026-01-15')
  })

  it('사진 없으면 hasPhoto=false', async () => {
    const { user } = await setup()
    const data = await getWidgetData(
      user.id,
      db.prismaMedia,
      db.prismaPublic,
      new FakeMediaClient(),
    )
    expect(data?.hasPhoto).toBe(false)
    expect(data?.photoUrl).toBeNull()
  })
})
