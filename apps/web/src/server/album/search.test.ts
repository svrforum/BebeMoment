import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createAlbum } from './create'
import { searchAlbums } from './search'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.album.deleteMany()
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
  // 비밀 부모 + 그 아래 비-비밀 자식 + 무관한 공개 앨범 (모두 'Trip' 매칭)
  const secretParent = await createAlbum(
    { familyId: family.id, byUserId: user.id, name: 'Trip비밀', secret: true },
    db.prismaPublic,
  )
  const childUnderSecret = await createAlbum(
    { familyId: family.id, byUserId: user.id, name: 'Trip자식', parentId: secretParent.id },
    db.prismaPublic,
  )
  const publicAlbum = await createAlbum(
    { familyId: family.id, byUserId: user.id, name: 'Trip공개' },
    db.prismaPublic,
  )
  return { user, family, secretParent, childUnderSecret, publicAlbum }
}

describe('searchAlbums secrecy', () => {
  it('family 역할에겐 비밀 조상 아래의 비-비밀 앨범도 숨긴다', async () => {
    const { family, publicAlbum } = await setup()
    const results = await searchAlbums(
      { familyId: family.id, q: 'Trip', viewerRole: 'family' },
      db.prismaPublic,
    )
    const ids = results.map((r) => r.id)
    // 공개 앨범만 보이고, 비밀 부모·그 자식은 안 보인다
    expect(ids).toEqual([publicAlbum.id])
  })

  it('owner 역할은 비밀 조상 트리도 모두 본다', async () => {
    const { family, secretParent, childUnderSecret, publicAlbum } = await setup()
    const results = await searchAlbums(
      { familyId: family.id, q: 'Trip', viewerRole: 'owner' },
      db.prismaPublic,
    )
    const ids = results.map((r) => r.id).sort()
    expect(ids).toEqual([secretParent.id, childUnderSecret.id, publicAlbum.id].sort())
  })
})
