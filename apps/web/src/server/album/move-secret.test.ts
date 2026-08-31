import { setSetting } from '@/server/settings/set'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAlbum } from './create'
import { moveAlbum } from './move'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.appSetting.deleteMany()
  await db.prismaPublic.album.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

async function setup() {
  const { user } = await signup(
    { username: `own${Date.now()}`, password: 'password123', displayName: 'O' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'F', userId: user.id }, db.prismaPublic)
  const { user: fam } = await signup(
    { username: `fam${Date.now()}`, password: 'password123', displayName: 'G' },
    db.prismaPublic,
  )
  await db.prismaPublic.membership.create({
    data: { familyId: family.id, userId: fam.id, role: 'family' },
  })
  return { user, family, fam }
}

describe('moveAlbum 비밀 가시성', () => {
  // 앨범 쓰기 중 유일하게 비밀 가시성을 안 보던 곳 — family 역할이 비밀 조상 아래 숨어
  // 있던 앨범을 루트로 옮겨 되드러낼 수 있었다.
  it('family 역할은 비밀 조상 아래의 앨범을 옮길 수 없다(존재 비노출)', async () => {
    const { user, family, fam } = await setup()
    await setSetting(
      'permissions.family',
      ['album.create', 'album.update.own'],
      null,
      db.prismaPublic,
    )
    const parent = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Parent' },
      db.prismaPublic,
    )
    // 아직 비밀이 아닐 때 family 멤버가 하위 앨범을 만든다(그래서 update.own 이 성립).
    const child = await createAlbum(
      { familyId: family.id, byUserId: fam.id, name: 'Child', parentId: parent.id },
      db.prismaPublic,
    )
    // 이제 보호자가 부모를 비밀로 바꾼다 — 자식도 함께 숨겨진다.
    await db.prismaPublic.album.update({ where: { id: parent.id }, data: { secret: true } })

    await expect(
      moveAlbum(
        { albumId: child.id, familyId: family.id, byUserId: fam.id, newParentId: null },
        db.prismaPublic,
      ),
    ).rejects.toThrow('album.notFound')
  })

  it('보호자는 그대로 옮길 수 있다', async () => {
    const { user, family } = await setup()
    const parent = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Parent' },
      db.prismaPublic,
    )
    const child = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Child', parentId: parent.id },
      db.prismaPublic,
    )
    await db.prismaPublic.album.update({ where: { id: parent.id }, data: { secret: true } })
    const moved = await moveAlbum(
      { albumId: child.id, familyId: family.id, byUserId: user.id, newParentId: null },
      db.prismaPublic,
    )
    expect(moved.parentId).toBeNull()
  })

  it('비밀이 아니면 family 역할도 옮길 수 있다 — 가드가 과하게 막지 않는다', async () => {
    const { user, family, fam } = await setup()
    await setSetting(
      'permissions.family',
      ['album.create', 'album.update.own'],
      null,
      db.prismaPublic,
    )
    const target = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Open' },
      db.prismaPublic,
    )
    const mine = await createAlbum(
      { familyId: family.id, byUserId: fam.id, name: 'Mine' },
      db.prismaPublic,
    )
    const moved = await moveAlbum(
      { albumId: mine.id, familyId: family.id, byUserId: fam.id, newParentId: target.id },
      db.prismaPublic,
    )
    expect(moved.parentId).toBe(target.id)
  })
})
