import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createBaby } from '../baby/create'
import { createFamily } from '../family/create'
import { setSetting } from '../settings/set'
import { createStoryEntry } from './create'
import { updateStoryEntry } from './update'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.storyAsset.deleteMany()
  await db.prismaPublic.story.deleteMany()
  await db.prismaMedia.assetBaby.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.baby.deleteMany()
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
  const baby = await createBaby(
    { familyId: family.id, name: 'B', birthDate: '2026-01-01', byUserId: user.id },
    db.prismaPublic,
  )
  return { user, family, baby }
}

async function makeReadyAsset(
  familyId: string,
  userId: string,
  sha256: string,
  originalKey: string,
) {
  const asset = await createAsset(
    {
      familyId,
      uploadedByUserId: userId,
      kind: 'image',
      originalKey,
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1n,
      sha256,
      takenAt: new Date('2026-03-01'),
      takenAtSource: 'uploaded',
    },
    db.prismaPublic,
    db.prismaMedia,
  )
  await updateAssetStatus({ assetId: asset.id, familyId, status: 'ready' }, db.prismaMedia)
  return asset
}

describe('updateStoryEntry', () => {
  it('updates own title and body', async () => {
    const { user, family, baby } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'a'.repeat(64), 'upd-o1')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        title: '원제목',
        body: '원본문',
        assetIds: [a.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateStoryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { title: '새제목', body: '새본문' },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.title).toBe('새제목')
    expect(updated.body).toBe('새본문')
  })

  it('toggles babyId to null', async () => {
    const { user, family, baby } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'b'.repeat(64), 'upd-o2')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        assetIds: [a.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateStoryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { babyId: null },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.babyId).toBeNull()
  })

  it('owner 가 family 스토리를 guardians 로 바꾼다', async () => {
    const { user, family, baby } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'd'.repeat(64), 'upd-vis1')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        assetIds: [a.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(entry.visibility).toBe('family')
    const updated = await updateStoryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { visibility: 'guardians' },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.visibility).toBe('guardians')
    const row = await db.prismaPublic.story.findUnique({ where: { id: entry.id } })
    expect(row?.visibility).toBe('guardians')
  })

  it('owner 가 guardians 스토리를 family 로 되돌린다', async () => {
    const { user, family, baby } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'e'.repeat(64), 'upd-vis2')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        assetIds: [a.id],
        visibility: 'guardians',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(entry.visibility).toBe('guardians')
    const updated = await updateStoryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { visibility: 'family' },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.visibility).toBe('family')
  })

  it('visibility 없는 patch 는 기존 공개범위를 유지한다', async () => {
    const { user, family, baby } = await setup()
    const a = await makeReadyAsset(family.id, user.id, 'f'.repeat(64), 'upd-vis3')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: baby.id,
        entryDate: '2026-04-01',
        body: '본문',
        assetIds: [a.id],
        visibility: 'guardians',
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateStoryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: user.id,
        patch: { body: '바뀐본문' },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.body).toBe('바뀐본문')
    expect(updated.visibility).toBe('guardians')
  })

  it('아직 처리 중(non-ready)인 새 사진도 첨부할 수 있다 — 편집 "사진 추가" 회귀', async () => {
    const { user, family } = await setup()
    const seed = await makeReadyAsset(family.id, user.id, 'c'.repeat(64), 'upd-o3')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-01',
        body: '본문',
        assetIds: [seed.id],
        byUserId: user.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    // createAsset 는 ready 가 아닌 기본 상태로 자산을 만든다(업로드 직후 = 처리 중).
    const asset = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'k-upd-1',
        originalFilename: 'a.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: 'sha-upd-regression-1',
        takenAt: new Date('2026-03-01'),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateStoryEntry(
      { id: entry.id, familyId: family.id, byUserId: user.id, patch: { assetIds: [asset.id] } },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.id).toBe(entry.id)
    const links = await db.prismaPublic.storyAsset.findMany({ where: { entryId: entry.id } })
    expect(links.map((l) => l.assetId)).toEqual([asset.id])
  })

  // 편집 폼은 현재 가시성을 그대로 되보낸다. 값이 같은데 family 역할이라고 거부하면
  // record.edit.own 을 받은 family 편집자는 본문 한 줄도 못 고친다(저장마다 403).
  it('family 편집자가 바뀌지 않은 visibility 를 함께 보내도 저장된다', async () => {
    const { user: owner, family } = await setup()
    const { user: editor } = await signup(
      { username: 'editor', password: 'password123', displayName: 'E' },
      db.prismaPublic,
    )
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: editor.id, role: 'family' },
    })
    await setSetting(
      'permissions.family',
      ['record.create', 'record.edit.own'],
      null,
      db.prismaPublic,
    )
    const a = await makeReadyAsset(family.id, owner.id, '1'.repeat(64), 'upd-fam1')
    const entry = await createStoryEntry(
      {
        familyId: family.id,
        babyId: null,
        entryDate: '2026-04-01',
        body: '원본문',
        assetIds: [a.id],
        byUserId: editor.id,
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await updateStoryEntry(
      {
        id: entry.id,
        familyId: family.id,
        byUserId: editor.id,
        patch: { body: '고친 본문', visibility: 'family' },
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(updated.body).toBe('고친 본문')
    expect(updated.visibility).toBe('family')

    await expect(
      updateStoryEntry(
        {
          id: entry.id,
          familyId: family.id,
          byUserId: editor.id,
          patch: { visibility: 'guardians' },
        },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow('story.visibilityGuardianOnly')
  })
})
