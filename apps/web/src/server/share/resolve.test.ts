import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAsset } from '../asset/create'
import { updateAssetStatus } from '../asset/update-status'
import { signup } from '../auth/signup'
import { createFamily } from '../family/create'
import { createShareLink } from './create'
import { resolveShareLink } from './resolve'

let db: FullTestDb
beforeAll(async () => {
  db = await startFullTestDb()
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.shareLink.deleteMany()
  await db.prismaMedia.asset.deleteMany()
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

let counter = 0
async function makeReadyAsset(familyId: string, userId: string): Promise<string> {
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
      takenAt: new Date('2026-04-01'),
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
    { username: `owner${counter}${Date.now()}`, password: 'password123', displayName: 'O' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: 'Fam', userId: user.id }, db.prismaPublic)
  return { user, family }
}

describe('resolveShareLink', () => {
  it('is notfound for unknown, empty and oversized tokens', async () => {
    expect(await resolveShareLink('nope', db.prismaPublic)).toEqual({ status: 'notfound' })
    expect(await resolveShareLink('', db.prismaPublic)).toEqual({ status: 'notfound' })
    expect(await resolveShareLink('x'.repeat(201), db.prismaPublic)).toEqual({ status: 'notfound' })
  })

  it('resolves a story-less date link and stamps last_accessed_at', async () => {
    const { user, family } = await setup()
    const { token } = await createShareLink(
      {
        target: { kind: 'date', date: '2026-04-01' },
        familyId: family.id,
        userId: user.id,
        ttl: '7d',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const before = await db.prismaPublic.shareLink.findUnique({ where: { token } })
    expect(before?.lastAccessedAt).toBeNull()

    const r = await resolveShareLink(token, db.prismaPublic)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.familyId).toBe(family.id)
    expect(r.target).toEqual({ kind: 'date', date: '2026-04-01' })

    const after = await db.prismaPublic.shareLink.findUnique({ where: { token } })
    expect(after?.lastAccessedAt).not.toBeNull()
  })

  it('distinguishes revoked from expired', async () => {
    const { user, family } = await setup()
    const a = await makeReadyAsset(family.id, user.id)
    const revoked = await createShareLink(
      { target: { kind: 'asset', assetId: a }, familyId: family.id, userId: user.id, ttl: '1d' },
      db.prismaPublic,
      db.prismaMedia,
    )
    await db.prismaPublic.shareLink.update({
      where: { token: revoked.token },
      data: { revokedAt: new Date() },
    })
    expect(await resolveShareLink(revoked.token, db.prismaPublic)).toEqual({ status: 'revoked' })

    const expired = await createShareLink(
      { target: { kind: 'asset', assetId: a }, familyId: family.id, userId: user.id, ttl: '1d' },
      db.prismaPublic,
      db.prismaMedia,
    )
    await db.prismaPublic.shareLink.update({
      where: { token: expired.token },
      data: { expiresAt: new Date(Date.now() - 1) },
    })
    expect(await resolveShareLink(expired.token, db.prismaPublic)).toEqual({ status: 'expired' })
  })

  // 경계: expires_at <= now 는 만료, 미래(단 1초라도)는 유효.
  it('treats expiry as exclusive at the boundary', async () => {
    const { user, family } = await setup()
    const a = await makeReadyAsset(family.id, user.id)
    const link = await createShareLink(
      { target: { kind: 'asset', assetId: a }, familyId: family.id, userId: user.id, ttl: '1d' },
      db.prismaPublic,
      db.prismaMedia,
    )
    await db.prismaPublic.shareLink.update({
      where: { token: link.token },
      data: { expiresAt: new Date(Date.now() + 5_000) },
    })
    expect((await resolveShareLink(link.token, db.prismaPublic)).status).toBe('ok')
    await db.prismaPublic.shareLink.update({
      where: { token: link.token },
      data: { expiresAt: new Date(Date.now() - 5_000) },
    })
    expect((await resolveShareLink(link.token, db.prismaPublic)).status).toBe('expired')
  })

  it('returns a selection in its saved order', async () => {
    const { user, family } = await setup()
    const ids = [
      await makeReadyAsset(family.id, user.id),
      await makeReadyAsset(family.id, user.id),
      await makeReadyAsset(family.id, user.id),
    ]
    const ordered = [ids[2], ids[0], ids[1]] as string[]
    const { token } = await createShareLink(
      {
        target: { kind: 'selection', assetIds: ordered },
        familyId: family.id,
        userId: user.id,
        ttl: 'permanent',
      },
      db.prismaPublic,
      db.prismaMedia,
    )
    const r = await resolveShareLink(token, db.prismaPublic)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.target).toEqual({ kind: 'selection', assetIds: ordered })
  })
})
