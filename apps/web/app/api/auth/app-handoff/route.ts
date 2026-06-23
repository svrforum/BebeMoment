import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { mintSessionCookie } from '@/lib/oidc-session'
import { readJsonLimited } from '@/lib/read-json-limited'
import { exchangeAppHandoff } from '@/server/auth/app-handoff'
import { clientIp, rateLimit, tooManyRequests } from '@/server/auth/rate-limit'
import { isUserFullySuspended } from '@/server/auth/suspension'
import { NextResponse } from 'next/server'
import { z } from 'zod'

// SNS 앱-로그인 핸드오프 교환(무인증 — code+verifier 가 자격). 앱이 deep link 로 받은
// code 와 자신이 만든 verifier 를 보내면, 검증 후 세션 쿠키 값을 돌려준다. 앱은 그 값을
// WebView CookieManager 에 심고 새로고침해 로그인 상태가 된다.
const Body = z.object({ code: z.string().min(1).max(200), verifier: z.string().min(32).max(200) })

export async function POST(req: Request) {
  const rl = await rateLimit(`handoff:${clientIp(req)}`, 20, 60)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)
  try {
    const { code, verifier } = Body.parse(await readJsonLimited(req))
    // 코드 단위 캡(IP 무관) — 한 handoff code 에 대한 verifier 추측 시도를 묶는다.
    const rlCode = await rateLimit(`handoff-code:${code}`, 5, 300)
    if (!rlCode.ok) return tooManyRequests(rlCode.retryAfter)
    const { userId, currentFamilyId } = await exchangeAppHandoff({ code, verifier }, prismaPublic)
    if (await isUserFullySuspended(userId, prismaPublic)) {
      return errorJsonKey('auth.accountSuspendedShort', 403)
    }
    const cookie = await mintSessionCookie(userId, currentFamilyId)
    return NextResponse.json({
      cookie: { name: cookie.name, value: cookie.value, maxAge: cookie.maxAge },
    })
  } catch (e) {
    return errorJson(e)
  }
}
