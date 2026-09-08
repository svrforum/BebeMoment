import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { setSetting } from '../settings/set'
import { createAsset } from './create'
import { softDeleteAsset } from './soft-delete'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('softDeleteAsset', () => {
  it('sets deletedAt on asset owned by uploader', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const a = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'k',
        originalFilename: 'f.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: 'a'.repeat(64),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await softDeleteAsset(
      { assetId: a.id, familyId: family.id, byUserId: user.id },
      db.prismaPublic,
      db.prismaMedia,
    )
    const updated = await db.prismaMedia.asset.findUnique({ where: { id: a.id } })
    expect(updated?.deletedAt).not.toBeNull()
  })

  it('rejects non-member user', async () => {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { user: outsider } = await signup(
      { email: 'x@x.com', password: 'password123', displayName: 'X' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
    const a = await createAsset(
      {
        familyId: family.id,
        uploadedByUserId: user.id,
        kind: 'image',
        originalKey: 'k',
        originalFilename: 'f.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1n,
        sha256: 'a'.repeat(64),
        takenAt: new Date(),
        takenAtSource: 'uploaded',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    await expect(
      softDeleteAsset(
        { assetId: a.id, familyId: family.id, byUserId: outsider.id },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow('asset.memberOnly')
  })

  // 스토리 제출이 실패하면 클라이언트가 방금 올린 사진을 되돌리려고(휴지통) 같은 삭제 라우트를
  // 부른다. 업로드만 받은 family 멤버는 asset.delete.own 이 없어 그 되돌림이 403 이었고,
  // 실패한 스토리마다 사진이 타임라인에 흩어졌다. 업로더 본인의 갓 올린 사진은 예외로 둔다.
  describe('uploader grace window without asset.delete.own', () => {
    async function familyUploader() {
      const { user: owner } = await signup(
        { username: 'owner', password: 'password123', displayName: 'O' },
        db.prismaPublic,
      )
      const { family } = await createFamily({ name: 'F', userId: owner.id }, db.prismaPublic)
      const { user: member } = await signup(
        { username: 'member', password: 'password123', displayName: 'M' },
        db.prismaPublic,
      )
      await db.prismaPublic.membership.create({
        data: { familyId: family.id, userId: member.id, role: 'family' },
      })
      await setSetting('permissions.family', ['asset.upload'], null, db.prismaPublic)
      return { owner, family, member }
    }

    async function upload(familyId: string, byUserId: string, sha: string) {
      return createAsset(
        {
          familyId,
          uploadedByUserId: byUserId,
          kind: 'image',
          originalKey: `k-${sha}`,
          originalFilename: 'f.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1n,
          sha256: sha.padEnd(64, '0'),
          takenAt: new Date(),
          takenAtSource: 'uploaded',
        },
        db.prismaPublic,
        db.prismaMedia,
      )
    }

    it('lets the uploader trash a photo created within the last hour', async () => {
      const { family, member } = await familyUploader()
      const a = await upload(family.id, member.id, 'grace-ok')
      await softDeleteAsset(
        { assetId: a.id, familyId: family.id, byUserId: member.id },
        db.prismaPublic,
        db.prismaMedia,
      )
      const row = await db.prismaMedia.asset.findUnique({ where: { id: a.id } })
      expect(row?.deletedAt).not.toBeNull()
    })

    it('denies the uploader once the photo is older than an hour', async () => {
      const { family, member } = await familyUploader()
      const a = await upload(family.id, member.id, 'grace-old')
      await db.prismaMedia.asset.update({
        where: { id: a.id },
        data: { createdAt: new Date(Date.now() - 61 * 60 * 1000) },
      })
      await expect(
        softDeleteAsset(
          { assetId: a.id, familyId: family.id, byUserId: member.id },
          db.prismaPublic,
          db.prismaMedia,
        ),
      ).rejects.toThrow('asset.deleteDenied')
    })

    it('denies a member who is not the uploader even inside the window', async () => {
      const { owner, family, member } = await familyUploader()
      const a = await upload(family.id, owner.id, 'grace-other')
      await expect(
        softDeleteAsset(
          { assetId: a.id, familyId: family.id, byUserId: member.id },
          db.prismaPublic,
          db.prismaMedia,
        ),
      ).rejects.toThrow('asset.deleteDenied')
    })
  })
})
