import { prismaPublic } from '@/lib/db-init'
import { resetPasswordWithToken } from '@/server/auth/password-reset'
import { clientIp, rateLimit, tooManyRequests } from '@/server/auth/rate-limit'
import { toHttpError } from '@/server/error'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(`pwreset:${clientIp(req)}`, 10, 60)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)
  try {
    const { token } = await params
    const body = await req.json()
    await resetPasswordWithToken({ token, newPassword: body?.newPassword }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message ?? '입력값이 올바르지 않아요' },
        { status: 400 },
      )
    }
    const { status, message } = toHttpError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
