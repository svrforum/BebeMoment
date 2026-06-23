import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { FakeMediaClient } from '@bebe/media-client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAlbum } from '../album/create'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createShareLink } from './create'
import { getPublicAlbumPreview } from './public-album'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.shareLink.deleteMany()
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
  return { user, family }
}

describe('album share with a secret ancestor', () => {
  it('refuses to create a share link for a non-secret album nested under a secret parent', async () => {
    const { user, family } = await setup()
    const secretParent = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Secret', secret: true },
      db.prismaPublic,
    )
    const child = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Child', parentId: secretParent.id },
      db.prismaPublic,
    )
    expect(child.secret).toBe(false)

    await expect(
      createShareLink(
        {
          target: { kind: 'album', albumId: child.id },
          familyId: family.id,
          userId: user.id,
          ttl: 'permanent',
        },
        db.prismaPublic,
        db.prismaMedia,
      ),
    ).rejects.toThrow()

    const links = await db.prismaPublic.shareLink.count({ where: { familyId: family.id } })
    expect(links).toBe(0)
  })

  it('still allows sharing a normal non-nested album', async () => {
    const { user, family } = await setup()
    const album = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Normal' },
      db.prismaPublic,
    )
    const { token } = await createShareLink(
      {
        target: { kind: 'album', albumId: album.id },
        familyId: family.id,
        userId: user.id,
        ttl: 'permanent',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    expect(token).toBeTruthy()
  })

  it('public preview returns null for an album under a secret ancestor (link minted before parent went secret)', async () => {
    const { user, family } = await setup()
    const secretParent = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Secret', secret: true },
      db.prismaPublic,
    )
    const child = await createAlbum(
      { familyId: family.id, byUserId: user.id, name: 'Child', parentId: secretParent.id },
      db.prismaPublic,
    )
    const preview = await getPublicAlbumPreview(
      child.id,
      family.id,
      'http://localhost:3000',
      db.prismaPublic,
      db.prismaMedia,
      new FakeMediaClient(),
    )
    expect(preview).toBeNull()
  })
})
