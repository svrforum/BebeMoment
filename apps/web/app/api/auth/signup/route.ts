import { prismaPublic } from '@/lib/db-init'
import { createSessionAndSetCookie } from '@/lib/session-cookie'
import { signup } from '@/server/auth/signup'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { user } = await signup(body, prismaPublic)
    await createSessionAndSetCookie(user.id)
    return NextResponse.json({ userId: user.id })
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues[0]
      return NextResponse.json(
        { error: first?.message ?? '입력값이 올바르지 않아요' },
        { status: 400 },
      )
    }
    const message = e instanceof Error ? e.message : '가입에 실패했어요'
    // Known user-facing errors from signup service (Korean messages)
    const isUserError =
      message.includes('이미 가입') ||
      message.includes('이메일') ||
      message.includes('비밀번호') ||
      message.includes('이름')
    return NextResponse.json({ error: message }, { status: isUserError ? 400 : 500 })
  }
}
