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

// Mirror of signCookieValue in oidc-session.ts (better-call signed-cookie format).
// If this drifts from Better Auth's reader, getSession below returns null.
async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
  return encodeURIComponent(`${value}.${signature}`)
}

describe('OIDC session minting', () => {
  it('internalAdapter session + manually-signed cookie is accepted by getSession', async () => {
    const user = await db.prismaPublic.user.create({
      data: { email: 'oidc@example.com', displayName: 'OIDC User', emailVerified: true },
    })
    const family = await db.prismaPublic.family.create({
      data: {
        id: '00000000-0000-0000-0000-0000000000bb',
        name: 'F',
        slug: 'oidc-f',
        createdByUserId: user.id,
      },
    })

    const ctx = await auth.$context
    const session = await ctx.internalAdapter.createSession(user.id, false, {
      currentFamilyId: family.id,
    })

    const cookieValue = await signCookieValue(session.token, ctx.secret)
    const cookieName = ctx.authCookies.sessionToken.name

    const result = await auth.api.getSession({
      headers: new Headers({ cookie: `${cookieName}=${cookieValue}` }),
    })

    expect(result?.session.userId).toBe(user.id)
    expect((result?.session as { currentFamilyId?: string } | undefined)?.currentFamilyId).toBe(
      family.id,
    )
  })
})
