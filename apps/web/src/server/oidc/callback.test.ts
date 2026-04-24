import { encryptSecret } from '@/lib/crypto'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { linkOrCreateUser } from './callback'

let db: FullTestDb
let providerId: string

beforeAll(async () => {
  db = await startFullTestDb()
  const enc = await encryptSecret('secret', 'x'.repeat(64))
  const p = await db.prismaPublic.oidcProvider.create({
    data: { name: 'P', issuer: 'https://p', clientId: 'c', clientSecretEnc: enc },
  })
  providerId = p.id
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.oidcIdentity.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('linkOrCreateUser', () => {
  it('creates new user when no match (verified email)', async () => {
    const u = await linkOrCreateUser(
      {
        providerId,
        subject: 'sub-1',
        email: 'a@b.com',
        emailVerified: true,
        displayName: 'Alice',
      },
      db.prismaPublic,
    )
    expect(u.email).toBe('a@b.com')
    expect(u.emailVerified).toBe(true)
  })

  it('creates new user with emailVerified=false when IdP does not verify', async () => {
    const u = await linkOrCreateUser(
      {
        providerId,
        subject: 'sub-1',
        email: 'a@b.com',
        emailVerified: false,
      },
      db.prismaPublic,
    )
    expect(u.email).toBe('a@b.com')
    expect(u.emailVerified).toBe(false)
  })

  it('reuses user on second callback (same subject)', async () => {
    const u1 = await linkOrCreateUser(
      { providerId, subject: 'sub-1', email: 'a@b.com', emailVerified: true },
      db.prismaPublic,
    )
    const u2 = await linkOrCreateUser(
      { providerId, subject: 'sub-1', email: 'a@b.com', emailVerified: true },
      db.prismaPublic,
    )
    expect(u1.id).toBe(u2.id)
  })

  it('links to existing user by email only when IdP asserts verified', async () => {
    const existing = await db.prismaPublic.user.create({
      data: { email: 'x@x.com', displayName: 'X', passwordHash: 'bcrypt' },
    })
    const u = await linkOrCreateUser(
      { providerId, subject: 'sub-new', email: 'x@x.com', emailVerified: true },
      db.prismaPublic,
    )
    expect(u.id).toBe(existing.id)
    const identity = await db.prismaPublic.oidcIdentity.findFirst({ where: { userId: existing.id } })
    expect(identity?.subject).toBe('sub-new')
  })

  it('does not link to existing user by email when IdP does not verify', async () => {
    const existing = await db.prismaPublic.user.create({
      data: { email: 'y@y.com', displayName: 'Y', passwordHash: 'bcrypt' },
    })
    // Takeover prevention: when the IdP does not assert email verified,
    // we must not fall back to linking by email. The attempted user.create
    // then collides with the existing unique email and the flow fails
    // safely rather than silently hijacking the existing account.
    await expect(
      linkOrCreateUser(
        { providerId, subject: 'sub-unverified', email: 'y@y.com', emailVerified: false },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
    const stillAloneIdentity = await db.prismaPublic.oidcIdentity.findFirst({
      where: { userId: existing.id },
    })
    expect(stillAloneIdentity).toBeNull()
  })
})
