import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { createSessionAndSetCookie } from '@/lib/oidc-session'
import { readJsonLimited } from '@/lib/read-json-limited'
import { resolveCurrentFamilyForUser } from '@/lib/session-cookie'
import { clientIp, rateLimit, tooManyRequests } from '@/server/auth/rate-limit'
import { isRegistrationOpen, validateInviteForSignup } from '@/server/auth/registration'
import { signup } from '@/server/auth/signup'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

const SignupInput = z.object({
  username: z.string().min(1, '아이디를 입력해주세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 해요'),
  displayName: z.string().min(1, '이름을 입력해주세요').max(80),
  email: z.string().email('올바른 이메일을 입력해주세요').optional(),
  inviteToken: z.string().min(1).optional(),
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
    if (!open) {
      const okInvite = input.inviteToken
        ? await validateInviteForSignup(input.inviteToken, prismaPublic)
        : false
      if (!okInvite) {
        return errorJsonKey('auth.registrationClosed', 403)
      }
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
