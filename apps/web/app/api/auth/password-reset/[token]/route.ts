import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonText } from '@/lib/error-response'
import { readJsonLimited } from '@/lib/read-json-limited'
import { resetPasswordWithToken } from '@/server/auth/password-reset'
import { clientIp, rateLimit, tooManyRequests } from '@/server/auth/rate-limit'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(`pwreset:${clientIp(req)}`, 10, 60)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)
  try {
    const { token } = await params
    // 토큰 단위 캡(IP 무관) — 헤더 스푸핑으로도 한 토큰에 대한 시도를 무한으로 못 만든다.
    const rlToken = await rateLimit(`pwreset-token:${token}`, 5, 300)
    if (!rlToken.ok) return tooManyRequests(rlToken.retryAfter)
    const body = (await readJsonLimited(req)) as { newPassword?: unknown }
    await resetPasswordWithToken({ token, newPassword: body?.newPassword }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof ZodError) {
      return await errorJsonText(e.issues[0]?.message ?? '입력값이 올바르지 않아요', 400)
    }
    return errorJson(e)
  }
}
