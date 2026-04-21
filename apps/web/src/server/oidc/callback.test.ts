import { encryptSecret } from '@/lib/crypto'
import { type TestDb, startTestDb } from '@bebe/db/src/test-db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { linkOrCreateUser } from './callback'

let db: TestDb
let providerId: string

beforeAll(async () => {
  db = await startTestDb()
  const enc = await encryptSecret('secret', 'x'.repeat(64))
  const p = await db.prisma.oidcProvider.create({
    data: { name: 'P', issuer: 'https://p', clientId: 'c', clientSecretEnc: enc },
  })
  providerId = p.id
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prisma.oidcIdentity.deleteMany()
  await db.prisma.user.deleteMany()
})

describe('linkOrCreateUser', () => {
  it('creates new user when no match', async () => {
    const u = await linkOrCreateUser(
      { providerId, subject: 'sub-1', email: 'a@b.com', displayName: 'Alice' },
      db.prisma,
    )
    expect(u.email).toBe('a@b.com')
    expect(u.emailVerified).toBe(true)
  })

  it('reuses user on second callback (same subject)', async () => {
    const u1 = await linkOrCreateUser({ providerId, subject: 'sub-1', email: 'a@b.com' }, db.prisma)
    const u2 = await linkOrCreateUser({ providerId, subject: 'sub-1', email: 'a@b.com' }, db.prisma)
    expect(u1.id).toBe(u2.id)
  })

  it('links to existing user by email', async () => {
    const existing = await db.prisma.user.create({
      data: { email: 'x@x.com', displayName: 'X', passwordHash: 'bcrypt' },
    })
    const u = await linkOrCreateUser(
      { providerId, subject: 'sub-new', email: 'x@x.com' },
      db.prisma,
    )
    expect(u.id).toBe(existing.id)
    const identity = await db.prisma.oidcIdentity.findFirst({ where: { userId: existing.id } })
    expect(identity?.subject).toBe('sub-new')
  })
})
