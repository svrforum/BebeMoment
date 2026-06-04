import { prismaPublic } from '@/lib/db-init'
import { createSessionAndSetCookie } from '@/lib/oidc-session'
import { resolveCurrentFamilyForUser } from '@/lib/session-cookie'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { authenticate } from '@/server/auth/authenticate'
import { clientIp, rateLimit, tooManyRequests } from '@/server/auth/rate-limit'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

const LoginInput = z.object({
  identifier: z.string().min(1, '아이디 또는 이메일을 입력해주세요'),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  const rl = await rateLimit(`login:${clientIp(req)}`, 10, 60)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)
  try {
    const input = LoginInput.parse(await req.json())
    // 계정(아이디) 단위 추가 제한 — IP 단위 제한은 X-Forwarded-For 위조로 우회될 수
    // 있으므로, 비번 무차별 대입의 표적인 "한 계정"에 5분당 8회로 캡(IP 무관).
    const idKey = input.identifier.trim().toLowerCase()
    const rlId = await rateLimit(`login-id:${idKey}`, 8, 300)
    if (!rlId.ok) return tooManyRequests(rlId.retryAfter)
    const user = await authenticate(input, prismaPublic)
    if (!user) {
      return errorJsonKey('auth.invalidCredentials', 400)
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
