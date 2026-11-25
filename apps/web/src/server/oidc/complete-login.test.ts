import crypto from 'node:crypto'
import { encryptSecret } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { exchangeAppHandoff, hashVerifier } from '@/server/auth/app-handoff'
import { signup } from '@/server/auth/signup'
import { createFamily } from '@/server/family/create'
import { createInvite } from '@/server/invite/create'
import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { linkOrCreateUser } from './callback'
import { type OidcFlowCookies, completeOidcCallback } from './complete-login'
import type { IdentityRequest, VerifiedIdentity } from './identity'
import { createProvider } from './providers'

const SECRET_KEY = 'k'.repeat(64)
const REDIRECT_URI = 'https://app.example.com/api/auth/oidc/p/callback'

let db: FullTestDb
let oidcId: string
let naverId: string
let disabledId: string
let staleSecretId: string

const fetchIdentity = vi.fn<(req: IdentityRequest) => Promise<VerifiedIdentity>>()

beforeAll(async () => {
  db = await startFullTestDb()
  const provider = (kind: string) =>
    createProvider(
      {
        name: kind,
        kind,
        issuer: 'https://idp.example.com',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        scopes: ['openid'],
      },
      SECRET_KEY,
      db.prismaPublic,
    )
  oidcId = (await provider('oidc')).id
  naverId = (await provider('naver')).id
  const disabled = await provider('oidc')
  await db.prismaPublic.oidcProvider.update({
    where: { id: disabled.id },
    data: { enabled: false },
  })
  disabledId = disabled.id
  // SECRET_KEY 를 바꾼 뒤 시크릿을 다시 저장하지 않은 상태 — 지금 키로는 풀리지 않는다.
  const stale = await provider('oidc')
  await db.prismaPublic.oidcProvider.update({
    where: { id: stale.id },
    data: { clientSecretEnc: await encryptSecret('client-secret', 'o'.repeat(64)) },
  })
  staleSecretId = stale.id
}, 120_000)
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  const p = db.prismaPublic
  await p.appAuthHandoff.deleteMany()
  await p.invite.deleteMany()
  await p.oidcIdentity.deleteMany()
  await p.membership.deleteMany()
  await p.family.deleteMany()
  await p.user.deleteMany()
  fetchIdentity.mockReset()
  vi.stubEnv('SETUP_TOKEN', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

type RunOpts = {
  providerId?: string
  code?: string | null
  state?: string | null
  cookies?: OidcFlowCookies
  identity?: VerifiedIdentity | Error
  sessionUserId?: string | null
}

function run(o: RunOpts = {}) {
  if (o.identity instanceof Error) fetchIdentity.mockRejectedValue(o.identity)
  else
    fetchIdentity.mockResolvedValue(
      o.identity ?? { subject: 'sub-new', emailVerified: false, displayName: 'IdP Name' },
    )
  return completeOidcCallback(
    {
      providerId: o.providerId ?? oidcId,
      code: 'code' in o ? (o.code ?? null) : 'code-1',
      state: 'state' in o ? (o.state ?? null) : 'state-1',
      redirectUri: REDIRECT_URI,
      cookies: { state: 'state-1', nonce: 'nonce-1', ...o.cookies },
    },
    {
      prisma: db.prismaPublic,
      secretKey: SECRET_KEY,
      fetchIdentity,
      sessionUserId: async () => o.sessionUserId ?? null,
    },
  )
}

let seq = 0
async function makeFamily() {
  const { user: owner } = await signup(
    { username: `owner${seq++}`, password: 'password123', displayName: 'Owner' },
    db.prismaPublic,
  )
  const { family } = await createFamily({ name: `F${seq++}`, userId: owner.id }, db.prismaPublic)
  return { owner, family }
}

async function makeInvite(familyId: string, ownerId: string, opts: { expired?: boolean } = {}) {
  const invite = await createInvite(
    { familyId, role: 'family', byUserId: ownerId },
    db.prismaPublic,
  )
  if (opts.expired) {
    await db.prismaPublic.invite.update({
      where: { token: invite.token },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
  }
  return invite.token
}

async function linkedUser(subject: string, displayName = 'Linked') {
  const { user } = await linkOrCreateUser(
    { providerId: oidcId, subject, emailVerified: false, displayName },
    db.prismaPublic,
  )
  return user
}

describe('request checks', () => {
  it('refuses a callback that came back without code or state', async () => {
    expect(await run({ code: null })).toEqual({ kind: 'fail', error: 'oidc' })
    expect(await run({ state: null })).toEqual({ kind: 'fail', error: 'oidc' })
    expect(fetchIdentity).not.toHaveBeenCalled()
  })

  it('refuses a state that does not match the cookie set at the start', async () => {
    expect(await run({ state: 'forged' })).toEqual({ kind: 'fail', error: 'state' })
    expect(await run({ cookies: { state: undefined } })).toEqual({ kind: 'fail', error: 'state' })
    expect(fetchIdentity).not.toHaveBeenCalled()
  })

  it('refuses an unknown or disabled provider', async () => {
    expect(await run({ providerId: crypto.randomUUID() })).toEqual({
      kind: 'fail',
      error: 'provider',
    })
    expect(await run({ providerId: disabledId })).toEqual({ kind: 'fail', error: 'provider' })
  })

  it('refuses and logs when the client secret no longer decrypts', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    expect(await run({ providerId: staleSecretId })).toEqual({ kind: 'fail', error: 'oidc_secret' })
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: staleSecretId }),
      expect.any(String),
    )
    expect(fetchIdentity).not.toHaveBeenCalled()
  })

  it('refuses a standard OIDC callback without the nonce cookie before calling the IdP', async () => {
    expect(await run({ cookies: { nonce: undefined } })).toEqual({ kind: 'fail', error: 'nonce' })
    expect(fetchIdentity).not.toHaveBeenCalled()
  })

  it('hands the IdP exchange the nonce, code, redirect URI and decrypted secret', async () => {
    await run()
    expect(fetchIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'oidc',
        code: 'code-1',
        nonce: 'nonce-1',
        redirectUri: REDIRECT_URI,
        clientSecret: 'client-secret',
      }),
    )
  })

  it('lets Naver through without a nonce, since it has no id_token', async () => {
    const r = await run({ providerId: naverId, cookies: { nonce: undefined } })
    expect(r.kind).toBe('session')
    expect(fetchIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'naver', code: 'code-1', state: 'state-1' }),
    )
  })

  it('turns an IdP failure into oidc_exchange and logs the error', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const r = await run({ identity: new Error('Token exchange failed: 400') })
    expect(r).toEqual({ kind: 'fail', error: 'oidc_exchange' })
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), providerId: oidcId }),
      expect.any(String),
    )
  })
})

describe('account linking mode', () => {
  it('refuses to link without a signed-in session', async () => {
    expect(await run({ cookies: { link: '1' } })).toEqual({ kind: 'fail', error: 'link_session' })
    expect(await db.prismaPublic.oidcIdentity.count()).toBe(0)
  })

  it('attaches the identity to the signed-in user and goes back to settings', async () => {
    const { owner } = await makeFamily()
    const r = await run({ cookies: { link: '1' }, sessionUserId: owner.id })
    expect(r).toEqual({ kind: 'redirect', to: '/settings?linked=1' })
    const identity = await db.prismaPublic.oidcIdentity.findFirst({ where: { subject: 'sub-new' } })
    expect(identity?.userId).toBe(owner.id)
  })

  it('reports a conflict when the identity already belongs to someone else', async () => {
    const { owner } = await makeFamily()
    await linkedUser('sub-new')
    const r = await run({ cookies: { link: '1' }, sessionUserId: owner.id })
    expect(r).toEqual({ kind: 'redirect', to: '/settings?error=link_conflict' })
  })
})

describe('sign-up gates', () => {
  it('open instance: creates the first user and signs in without a family', async () => {
    const r = await run()
    expect(r).toMatchObject({ kind: 'session', currentFamilyId: null, to: '/' })
    const user = await db.prismaPublic.user.findFirstOrThrow()
    expect(r).toMatchObject({ userId: user.id })
    expect(user.displayName).toBe('IdP Name')
  })

  it('open instance guarded by SETUP_TOKEN: refuses an OIDC sign-up, which cannot carry the token', async () => {
    vi.stubEnv('SETUP_TOKEN', 'setup-secret')
    expect(await run()).toEqual({ kind: 'fail', error: 'setup_required' })
    expect(await db.prismaPublic.user.count()).toBe(0)
  })

  it('SETUP_TOKEN does not block someone who is already linked', async () => {
    vi.stubEnv('SETUP_TOKEN', 'setup-secret')
    const user = await linkedUser('sub-new')
    expect(await run()).toMatchObject({ kind: 'session', userId: user.id })
  })

  it('closed instance: refuses a new identity without an invite', async () => {
    await makeFamily()
    const before = await db.prismaPublic.user.count()
    expect(await run()).toEqual({ kind: 'fail', error: 'invite_required' })
    expect(await db.prismaPublic.user.count()).toBe(before)
  })

  it('closed instance: refuses an invite that has expired', async () => {
    const { owner, family } = await makeFamily()
    const token = await makeInvite(family.id, owner.id, { expired: true })
    expect(await run({ cookies: { invite: token } })).toEqual({
      kind: 'fail',
      error: 'invite_required',
    })
  })

  it('closed instance: a valid invite creates the user under the chosen name and joins the family', async () => {
    const { owner, family } = await makeFamily()
    const token = await makeInvite(family.id, owner.id)
    const r = await run({ cookies: { invite: token, name: '  Chosen Name  ' } })
    expect(r).toMatchObject({ kind: 'session', currentFamilyId: family.id, to: '/' })
    const identity = await db.prismaPublic.oidcIdentity.findFirstOrThrow({
      where: { subject: 'sub-new' },
      include: { user: true },
    })
    expect(identity.user.displayName).toBe('Chosen Name')
    const invite = await db.prismaPublic.invite.findUniqueOrThrow({ where: { token } })
    expect(invite.acceptedById).toBe(identity.userId)
  })

  it('an existing user signs in without an invite and keeps their name', async () => {
    const { family } = await makeFamily()
    const user = await linkedUser('sub-new', 'Original')
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: user.id, role: 'family' },
    })
    const r = await run({ cookies: { name: 'Renamed' } })
    expect(r).toMatchObject({ kind: 'session', userId: user.id, currentFamilyId: family.id })
    const after = await db.prismaPublic.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.displayName).toBe('Original')
  })
})

describe('current family', () => {
  it('picks the membership joined first', async () => {
    const a = await makeFamily()
    const b = await makeFamily()
    const user = await linkedUser('sub-new')
    await db.prismaPublic.membership.create({
      data: { familyId: a.family.id, userId: user.id, role: 'family', joinedAt: new Date(2000) },
    })
    await db.prismaPublic.membership.create({
      data: { familyId: b.family.id, userId: user.id, role: 'family', joinedAt: new Date(1000) },
    })
    expect(await run()).toMatchObject({ currentFamilyId: b.family.id })
  })

  it('leaves an invite unused when the user already belongs to a family', async () => {
    const a = await makeFamily()
    const b = await makeFamily()
    const user = await linkedUser('sub-new')
    await db.prismaPublic.membership.create({
      data: { familyId: a.family.id, userId: user.id, role: 'family' },
    })
    const token = await makeInvite(b.family.id, b.owner.id)
    expect(await run({ cookies: { invite: token } })).toMatchObject({
      currentFamilyId: a.family.id,
    })
    const invite = await db.prismaPublic.invite.findUniqueOrThrow({ where: { token } })
    expect(invite.acceptedAt).toBeNull()
  })

  it('still signs in, without a family, when the invite can no longer be accepted', async () => {
    const { owner, family } = await makeFamily()
    const user = await linkedUser('sub-new')
    const token = await makeInvite(family.id, owner.id, { expired: true })
    expect(await run({ cookies: { invite: token } })).toMatchObject({
      kind: 'session',
      userId: user.id,
      currentFamilyId: null,
    })
  })
})

describe('suspension', () => {
  it('refuses a user whose every membership is suspended, before any app hand-off', async () => {
    const { family } = await makeFamily()
    const user = await linkedUser('sub-new')
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: user.id, role: 'family', suspendedAt: new Date() },
    })
    const challenge = hashVerifier(crypto.randomBytes(32).toString('base64url'))
    expect(await run()).toEqual({ kind: 'fail', error: 'suspended' })
    expect(await run({ cookies: { appChallenge: challenge } })).toEqual({
      kind: 'fail',
      error: 'suspended',
    })
    expect(await db.prismaPublic.appAuthHandoff.count()).toBe(0)
  })
})

describe('app hand-off', () => {
  it('issues a one-time code the app exchanges with its verifier, instead of a session', async () => {
    const { family } = await makeFamily()
    const user = await linkedUser('sub-new')
    await db.prismaPublic.membership.create({
      data: { familyId: family.id, userId: user.id, role: 'family' },
    })
    const verifier = crypto.randomBytes(32).toString('base64url')
    const r = await run({ cookies: { appChallenge: hashVerifier(verifier), next: '/story/3' } })
    if (r.kind !== 'handoff') throw new Error(`expected handoff, got ${r.kind}`)
    expect(await exchangeAppHandoff({ code: r.code, verifier }, db.prismaPublic)).toEqual({
      userId: user.id,
      currentFamilyId: family.id,
    })
  })

  it('fails the login when the challenge is malformed', async () => {
    await linkedUser('sub-new')
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    expect(await run({ cookies: { appChallenge: 'short' } })).toEqual({
      kind: 'fail',
      error: 'oidc_exchange',
    })
  })
})

describe('return path', () => {
  it('returns to the same-origin path saved before login', async () => {
    expect(await run({ cookies: { next: '/story/20?from=share' } })).toMatchObject({
      kind: 'session',
      to: '/story/20?from=share',
    })
  })

  it.each([
    ['protocol-relative', '//evil.example/x'],
    ['backslash', '/\\evil.example'],
    ['absolute URL', 'https://evil.example/'],
    ['relative path', 'evil'],
    ['empty', ''],
  ])('falls back to home for a %s next path', async (_label, next) => {
    await linkedUser('sub-new')
    expect(await run({ cookies: { next } })).toMatchObject({ kind: 'session', to: '/' })
  })
})
