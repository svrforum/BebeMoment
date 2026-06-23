import { encryptSecret } from '@/lib/crypto'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { findLinkedUser, linkOrCreateUser } from './callback'

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
    expect(u.user.email).toBe('a@b.com')
    expect(u.user.emailVerified).toBe(true)
    expect(u.created).toBe(true)
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
    expect(u.user.email).toBe('a@b.com')
    expect(u.user.emailVerified).toBe(false)
    expect(u.created).toBe(true)
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
    expect(u1.user.id).toBe(u2.user.id)
    expect(u2.created).toBe(false)
  })

  it('links to existing user by email only when BOTH the IdP and the local account are verified', async () => {
    const existing = await db.prismaPublic.user.create({
      data: {
        email: 'x@example.com',
        displayName: 'X',
        passwordHash: 'bcrypt',
        emailVerified: true,
      },
    })
    const u = await linkOrCreateUser(
      { providerId, subject: 'sub-new', email: 'x@example.com', emailVerified: true },
      db.prismaPublic,
    )
    expect(u.user.id).toBe(existing.id)
    expect(u.created).toBe(false)
    const identity = await db.prismaPublic.oidcIdentity.findFirst({
      where: { userId: existing.id },
    })
    expect(identity?.subject).toBe('sub-new')
  })

  it('does NOT merge into an existing UNVERIFIED account even when the IdP asserts verified', async () => {
    // Pre-account-takeover guard: a password account stores a typed, never-verified
    // email (emailVerified defaults to false). An attacker whose IdP asserts that
    // same email as verified must not be auto-linked into it.
    const existing = await db.prismaPublic.user.create({
      data: { email: 'owner@example.com', displayName: 'Owner', passwordHash: 'bcrypt' },
    })
    expect(
      await findLinkedUser(
        { providerId, subject: 'attacker-sub', email: 'owner@example.com', emailVerified: true },
        db.prismaPublic,
      ),
    ).toBeNull()
    // linkOrCreateUser must not bind the attacker identity to the owner; it fails
    // closed on the unique-email collision instead of hijacking the account.
    await expect(
      linkOrCreateUser(
        { providerId, subject: 'attacker-sub', email: 'owner@example.com', emailVerified: true },
        db.prismaPublic,
      ),
    ).rejects.toThrow()
    const identity = await db.prismaPublic.oidcIdentity.findFirst({
      where: { userId: existing.id },
    })
    expect(identity).toBeNull()
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

describe('findLinkedUser', () => {
  it('returns null when no identity and no verified-email match', async () => {
    const u = await findLinkedUser(
      { providerId, subject: 's', emailVerified: false },
      db.prismaPublic,
    )
    expect(u).toBeNull()
  })
})
