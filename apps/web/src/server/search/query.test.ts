import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAlbum } from '../album/create'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createStoryEntry } from '../story/create'
import { searchAll } from './query'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.face.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaPublic.milestone.deleteMany()
  await db.prismaPublic.album.deleteMany()
  await db.prismaPublic.baby.deleteMany()
  await db.prismaMedia.person.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function seed() {
  const { user } = await signup(
    { username: 'owner', password: 'password123', displayName: 'Owner' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'Fam', userId: user.id }, db.prismaPublic)
  const fid = family.id
  const baby = await db.prismaPublic.baby.create({
    data: { familyId: fid, name: '딸기검색', birthDate: new Date('2025-01-01') },
  })
  await db.prismaPublic.story.create({
    data: {
      familyId: fid,
      entryDate: new Date('2026-04-01'),
      title: '첫 검색 스토리',
      body: '딸기가 걸었어요',
      createdByUserId: user.id,
    },
  })
  await db.prismaPublic.story.create({
    data: {
      familyId: fid,
      entryDate: new Date('2026-04-02'),
      body: '비밀 검색 내용',
      visibility: 'guardians',
      createdByUserId: user.id,
    },
  })
  await db.prismaPublic.milestone.create({
    data: {
      familyId: fid,
      babyId: baby.id,
      achievedAt: new Date('2026-04-01'),
      customLabel: '검색 마일스톤',
      createdByUserId: user.id,
    },
  })
  await createAlbum({ familyId: fid, name: '검색 앨범', byUserId: user.id }, db.prismaPublic)
  await createAlbum(
    { familyId: fid, name: '비밀 검색 앨범', secret: true, byUserId: user.id },
    db.prismaPublic,
  )
  await db.prismaMedia.person.create({ data: { familyId: fid, name: '검색 인물' } })
  return fid
}

describe('searchAll', () => {
  it('finds matches across entities for owner (faces on)', async () => {
    const fid = await seed()
    const r = await searchAll(
      { familyId: fid, viewerRole: 'owner', query: '검색', facesEnabled: true },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(r.stories.length).toBe(2) // public + guardians (owner sees both)
    expect(r.milestones.length).toBe(1)
    expect(r.albums.length).toBe(2) // incl. secret (owner)
    expect(r.babies.length).toBe(1)
    expect(r.people.length).toBe(1)
    expect(r.total).toBe(7)
  })

  it('hides guardians-only stories and secret albums from family role', async () => {
    const fid = await seed()
    const r = await searchAll(
      { familyId: fid, viewerRole: 'family', query: '검색', facesEnabled: true },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(r.stories.length).toBe(1) // guardians-only excluded
    expect(r.stories[0]?.title).toBe('첫 검색 스토리')
    expect(r.albums.length).toBe(1) // secret album excluded
    expect(r.albums[0]?.name).toBe('검색 앨범')
  })

  it('omits people when faces feature is off', async () => {
    const fid = await seed()
    const r = await searchAll(
      { familyId: fid, viewerRole: 'owner', query: '검색', facesEnabled: false },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(r.people.length).toBe(0)
  })

  it('returns empty for blank query', async () => {
    const fid = await seed()
    const r = await searchAll(
      { familyId: fid, viewerRole: 'owner', query: '   ', facesEnabled: true },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(r.total).toBe(0)
  })

  it('excludes a person from family search when all their live faces are secret-story photos', async () => {
    const { user } = await signup(
      { username: 'owner2', password: 'password123', displayName: 'O2' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'Fam2', userId: user.id }, db.prismaPublic)
    const fid = family.id
    const asset = await createAsset(
      {
        familyId: fid,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'pf-1',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: 'aa'.padEnd(64, '0'),
        takenAt: new Date('2026-03-01'),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await updateAssetStatus({ assetId: asset.id, familyId: fid, status: 'ready' }, db.prismaMedia)
    // the only photo carrying this person's face is in a guardians-only (secret) story
    await createStoryEntry(
      {
        familyId: fid,
        babyId: null,
        entryDate: '2026-04-02',
        body: 'secret',
        visibility: 'guardians',
        assetIds: [asset.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const person = await db.prismaMedia.person.create({
      data: { familyId: fid, name: '검색얼굴' },
    })
    await db.prismaMedia.face.create({
      data: {
        familyId: fid,
        assetId: asset.id,
        personId: person.id,
        bboxX: 0.1,
        bboxY: 0.1,
        bboxW: 0.2,
        bboxH: 0.2,
        detScore: 0.9,
      },
    })

    const familyView = await searchAll(
      { familyId: fid, viewerRole: 'family', query: '검색', facesEnabled: true },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(familyView.people.length).toBe(0)

    const ownerView = await searchAll(
      { familyId: fid, viewerRole: 'owner', query: '검색', facesEnabled: true },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(ownerView.people.map((p) => p.name)).toContain('검색얼굴')
  })

  it('does not leak another family data', async () => {
    await seed()
    const r = await searchAll(
      {
        familyId: '00000000-0000-0000-0000-000000000000',
        viewerRole: 'owner',
        query: '검색',
        facesEnabled: true,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(r.total).toBe(0)
  })
})
