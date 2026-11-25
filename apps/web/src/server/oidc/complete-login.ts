import { logger } from '@/lib/logger'
import { safeNextPath } from '@/lib/safe-next-path'
import { createAppHandoff } from '@/server/auth/app-handoff'
import {
  isBootstrapSetupAllowed,
  isRegistrationOpen,
  validateInviteForSignup,
} from '@/server/auth/registration'
import { isUserFullySuspended } from '@/server/auth/suspension'
import { acceptInvite } from '@/server/invite/accept'
import type { PrismaClient } from '@bebe/db-public'
import { type LinkOrCreateInput, findLinkedUser, linkOrCreateUser } from './callback'
import { tryDecryptClientSecret } from './client-secret'
import type { IdentityRequest, VerifiedIdentity } from './identity'
import { linkIdentityToUser } from './link'

// 시작 라우트가 심어 두고 콜백이 읽는 1회용 쿠키 값들.
export type OidcFlowCookies = {
  state?: string | undefined
  nonce?: string | undefined
  invite?: string | undefined
  link?: string | undefined
  name?: string | undefined
  appChallenge?: string | undefined
  next?: string | undefined
}

export type OidcLoginError =
  | 'oidc'
  | 'state'
  | 'provider'
  | 'oidc_secret'
  | 'nonce'
  | 'oidc_exchange'
  | 'link_session'
  | 'setup_required'
  | 'invite_required'
  | 'suspended'

export type OidcCallbackOutcome =
  | { kind: 'fail'; error: OidcLoginError }
  | { kind: 'redirect'; to: string }
  | { kind: 'session'; userId: string; currentFamilyId: string | null; to: string }
  | { kind: 'handoff'; code: string }

export type OidcCallbackInput = {
  providerId: string
  code: string | null
  state: string | null
  redirectUri: string
  cookies: OidcFlowCookies
}

export type OidcCallbackDeps = {
  prisma: PrismaClient
  secretKey: string
  fetchIdentity: (req: IdentityRequest) => Promise<VerifiedIdentity>
  sessionUserId: () => Promise<string | null>
}

export async function completeOidcCallback(
  input: OidcCallbackInput,
  deps: OidcCallbackDeps,
): Promise<OidcCallbackOutcome> {
  const { providerId, code, state, cookies } = input
  const { prisma } = deps
  const refuse = (error: OidcLoginError, userId?: string): OidcCallbackOutcome => {
    logger.warn({ providerId, error, ...(userId ? { userId } : {}) }, 'oidc callback refused')
    return { kind: 'fail', error }
  }

  if (!code || !state) return refuse('oidc')
  if (state !== cookies.state) return refuse('state')

  const provider = await prisma.oidcProvider.findUnique({ where: { id: providerId } })
  if (!provider?.enabled) return refuse('provider')

  // 대개 SECRET_KEY 회전 뒤 시크릿 재저장 누락 — 500 대신 로그인 화면에서 안내한다.
  const secret = await tryDecryptClientSecret(provider.clientSecretEnc, deps.secretKey)
  if (!secret.ok) {
    logger.error({ providerId }, 'oidc callback: client secret undecryptable (SECRET_KEY rotated?)')
    return { kind: 'fail', error: 'oidc_secret' }
  }
  const clientSecret = secret.clientSecret

  try {
    let identity: VerifiedIdentity
    if (provider.kind === 'naver') {
      identity = await deps.fetchIdentity({ kind: 'naver', provider, code, state, clientSecret })
    } else {
      // id_token nonce 는 필수 — 시작 때 심은 쿠키가 없으면 검증을 건너뛰지 말고 거절한다
      // (리플레이·주입 방지).
      if (!cookies.nonce) return refuse('nonce')
      identity = await deps.fetchIdentity({
        kind: 'oidc',
        provider,
        code,
        nonce: cookies.nonce,
        clientSecret,
        redirectUri: input.redirectUri,
      })
    }
    const linkInput: LinkOrCreateInput = { providerId, ...identity }

    // 계정 연동: 로그인한 사용자에게 신원만 붙이고 끝낸다(새 로그인·가입 아님).
    if (cookies.link === '1') {
      const userId = await deps.sessionUserId()
      if (!userId) return refuse('link_session')
      const r = await linkIdentityToUser(
        {
          userId,
          providerId,
          subject: linkInput.subject,
          ...(linkInput.email ? { email: linkInput.email } : {}),
        },
        prisma,
      )
      return {
        kind: 'redirect',
        to: r.conflict ? '/settings?error=link_conflict' : '/settings?linked=1',
      }
    }

    const inviteToken = cookies.invite ?? null
    const existing = await findLinkedUser(linkInput, prisma)
    if (!existing) {
      // 초대 가입 때 고른 표시 이름은 새 계정에만 쓴다(기존 사용자의 이름은 그대로).
      const chosenName = cookies.name?.trim()
      if (chosenName) linkInput.displayName = chosenName
      if (await isRegistrationOpen(prisma)) {
        // SETUP_TOKEN 으로 첫 소유자 선점을 막는 인스턴스 — OIDC 는 토큰을 실어 올 수 없으니
        // 첫 소유자는 아이디 가입(+SETUP_TOKEN)으로만 만든다.
        if (!isBootstrapSetupAllowed(undefined)) return refuse('setup_required')
      } else {
        // 가족이 이미 있는 인스턴스의 새 계정은 유효한 초대가 있어야 한다(떠돌이 계정 방지).
        const ok = inviteToken ? await validateInviteForSignup(inviteToken, prisma) : false
        if (!ok) return refuse('invite_required')
      }
    }

    const { user } = await linkOrCreateUser(linkInput, prisma)
    const currentFamilyId = await pickCurrentFamily(user.id, inviteToken, prisma)

    if (await isUserFullySuspended(user.id, prisma)) return refuse('suspended', user.id)

    if (cookies.appChallenge) {
      const handoff = await createAppHandoff(
        { userId: user.id, currentFamilyId, challenge: cookies.appChallenge },
        prisma,
      )
      return { kind: 'handoff', code: handoff.code }
    }

    // 로그인 전에 보던 곳(예: 공유 링크 /story/20)으로 — 같은 출처 경로만, 아니면 홈.
    const to = safeNextPath(cookies.next) ?? '/'
    return { kind: 'session', userId: user.id, currentFamilyId, to }
  } catch (err) {
    logger.error({ err, providerId }, 'oidc callback failed')
    return { kind: 'fail', error: 'oidc_exchange' }
  }
}

async function pickCurrentFamily(
  userId: string,
  inviteToken: string | null,
  prisma: PrismaClient,
): Promise<string | null> {
  if (inviteToken) {
    const member = await prisma.membership.findFirst({ where: { userId, deletedAt: null } })
    if (!member) {
      try {
        return (await acceptInvite({ token: inviteToken, userId }, prisma)).familyId
      } catch (err) {
        // 초대가 그사이 만료·취소됐다 — 로그인은 진행하고 가족 없이 온보딩/안내로 보낸다.
        logger.warn({ userId, err: (err as Error).message }, 'oidc callback: invite not accepted')
      }
    }
  }
  const first = await prisma.membership.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { joinedAt: 'asc' },
  })
  return first?.familyId ?? null
}
