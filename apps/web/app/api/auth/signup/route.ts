import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { createSessionAndSetCookie } from '@/lib/oidc-session'
import { readJsonLimited } from '@/lib/read-json-limited'
import { resolveCurrentFamilyForUser } from '@/lib/session-cookie'
import { clientIp, rateLimit, tooManyRequests } from '@/server/auth/rate-limit'
import {
  isBootstrapSetupAllowed,
  isRegistrationOpen,
  validateInviteForSignup,
} from '@/server/auth/registration'
import { signup } from '@/server/auth/signup'
import { acceptInvite } from '@/server/invite/accept'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

const SignupInput = z.object({
  username: z.string().min(1, '아이디를 입력해주세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 해요'),
  displayName: z.string().min(1, '이름을 입력해주세요').max(80),
  email: z.string().email('올바른 이메일을 입력해주세요').optional(),
  inviteToken: z.string().min(1).optional(),
  setupToken: z.string().min(1).optional(),
})

export async function POST(req: Request) {
  const rl = await rateLimit(`signup:${clientIp(req)}`, 5, 60)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)
  // IP 무관 전역 캡 — clientIp 는 프록시 헤더 기반이라 직접 노출 시 우회 가능하므로,
  // 헤더를 돌려도 가입 시도 자체가 무한이 되지 않게 인스턴스 전역으로도 묶는다.
  const rlGlobal = await rateLimit('signup:global', 30, 60)
  if (!rlGlobal.ok) return tooManyRequests(rlGlobal.retryAfter)
  try {
    const input = SignupInput.parse(await readJsonLimited(req))

    const open = await isRegistrationOpen(prismaPublic)
    let consumeInvite = false
    if (open) {
      // 최초 소유자 선점(landrush) 방어 — SETUP_TOKEN 이 설정된 인스턴스는 첫 가입에
      // 일치 토큰이 필요(미설정이면 통과). 노출 전 LAN 세팅이 어려운 공개 배포용 방어막.
      if (!isBootstrapSetupAllowed(input.setupToken)) {
        return errorJsonKey('auth.setupTokenRequired', 403)
      }
    } else {
      const okInvite = input.inviteToken
        ? await validateInviteForSignup(input.inviteToken, prismaPublic)
        : false
      if (!okInvite) {
        return errorJsonKey('auth.registrationClosed', 403)
      }
      consumeInvite = true
    }

    const { user } = await signup(
      {
        username: input.username,
        password: input.password,
        displayName: input.displayName,
        ...(input.email ? { email: input.email } : {}),
      },
      prismaPublic,
    )

    // 초대 가입은 토큰을 가입과 함께 즉시 소비(단일 사용)해 가족에 합류시킨다. 안 그러면
    // 누출된 초대 링크 하나로 임의 다수 계정을 만들 수 있다(validateInviteForSignup 은 검증
    // 전용). acceptInvite 의 트랜잭션 단일-사용 가드가 두 번째 가입의 토큰 재사용을 막는다.
    if (consumeInvite && input.inviteToken) {
      await acceptInvite({ token: input.inviteToken, userId: user.id }, prismaPublic)
    }

    const currentFamilyId = await resolveCurrentFamilyForUser(user.id, prismaPublic)
    await createSessionAndSetCookie(user.id, currentFamilyId)

    return NextResponse.json({ userId: user.id })
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message ?? '입력값이 올바르지 않아요' },
        { status: 400 },
      )
    }
    return errorJson(e)
  }
}
