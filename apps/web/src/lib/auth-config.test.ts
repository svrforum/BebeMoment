import { hashPassword } from '@/lib/password'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import type { PrismaClient } from '@bebe/db-public'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildAuth } from './auth-config'

let db: FullTestDb
let auth: ReturnType<typeof buildAuth>

const SECRET = 'test-secret-at-least-32-bytes-long-xxxx'
const BASE_URL = 'http://localhost:3000'

beforeAll(async () => {
  db = await startFullTestDb()
  auth = buildAuth(db.prismaPublic as unknown as PrismaClient, {
    secret: SECRET,
    baseURL: BASE_URL,
  })
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.session.deleteMany()
  await db.prismaPublic.account.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('Better Auth email/password', () => {
  it('signUp creates a user + credential account with a bcrypt hash', async () => {
    const res = await auth.api.signUpEmail({
      body: { email: 'alice@example.com', password: 'strong-password-1', name: 'Alice' },
      headers: new Headers(),
    })
    expect(res.user.email).toBe('alice@example.com')

    const account = await db.prismaPublic.account.findFirst({
      where: { userId: res.user.id, providerId: 'credential' },
    })
    expect(account).not.toBeNull()
    // bcryptjs hash, NOT the plaintext or Better Auth's default scrypt format.
    expect(account?.password).toMatch(/^\$2[aby]\$/)
  })

  it('signUp → signIn round-trips (new bcrypt hash verifies)', async () => {
    await auth.api.signUpEmail({
      body: { email: 'bob@example.com', password: 'strong-password-2', name: 'Bob' },
      headers: new Headers(),
    })
    const res = await auth.api.signInEmail({
      body: { email: 'bob@example.com', password: 'strong-password-2' },
      headers: new Headers(),
    })
    expect(res.user.email).toBe('bob@example.com')
  })

  it('verifies an EXISTING (migrated) bcrypt hash via the credential account', async () => {
    // Simulates the migration: a pre-existing user whose bcrypt hash was copied
    // into a credential account row. Proves existing users log in unchanged.
    const hash = await hashPassword('legacy-password')
    const user = await db.prismaPublic.user.create({
      data: { email: 'legacy@example.com', displayName: 'Legacy', emailVerified: true },
    })
    await db.prismaPublic.account.create({
      data: { accountId: user.id, providerId: 'credential', userId: user.id, password: hash },
    })

    const res = await auth.api.signInEmail({
      body: { email: 'legacy@example.com', password: 'legacy-password' },
      headers: new Headers(),
    })
    expect(res.user.id).toBe(user.id)
  })

  it('rejects a wrong password', async () => {
    await auth.api.signUpEmail({
      body: { email: 'carol@example.com', password: 'strong-password-3', name: 'Carol' },
      headers: new Headers(),
    })
    await expect(
      auth.api.signInEmail({
        body: { email: 'carol@example.com', password: 'wrong-password' },
        headers: new Headers(),
      }),
    ).rejects.toThrow()
  })

  it('currentFamilyId additional field flows through getSession', async () => {
    const { headers: signUpHeaders } = await auth.api.signUpEmail({
      returnHeaders: true,
      body: { email: 'dave@example.com', password: 'strong-password-4', name: 'Dave' },
      headers: new Headers(),
    })
    const user = await db.prismaPublic.user.findUniqueOrThrow({
      where: { email: 'dave@example.com' },
    })

    // Stamp currentFamilyId directly on the session row (what the login route +
    // onboarding flow do). Cookie cache is off, so getSession reads it fresh.
    const fakeFamilyId = '00000000-0000-0000-0000-0000000000aa'
    const family = await db.prismaPublic.family.create({
      data: { id: fakeFamilyId, name: 'F', slug: 'f', createdByUserId: user.id },
    })
    await db.prismaPublic.session.updateMany({
      where: { userId: user.id },
      data: { currentFamilyId: family.id },
    })

    // Re-present the session cookie issued at sign-up.
    const setCookie = signUpHeaders.get('set-cookie') ?? ''
    const cookiePair = setCookie.split(';')[0] ?? ''
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookiePair }),
    })
    expect(session?.session.userId).toBe(user.id)
    expect((session?.session as { currentFamilyId?: string }).currentFamilyId).toBe(family.id)
  })
})
