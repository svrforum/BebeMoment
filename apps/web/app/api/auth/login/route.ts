import { prismaPublic } from '@/lib/db-init'
import { createSessionAndSetCookie } from '@/lib/oidc-session'
import { setCurrentFamilyOnLatestSession } from '@/lib/session-cookie'
import { authenticate } from '@/server/auth/authenticate'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

const LoginInput = z.object({
  identifier: z.string().min(1, '아이디 또는 이메일을 입력해주세요'),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const input = LoginInput.parse(await req.json())
    const user = await authenticate(input, prismaPublic)
    if (!user) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않아요' }, { status: 400 })
    }
    await createSessionAndSetCookie(user.id, null)
    await setCurrentFamilyOnLatestSession(user.id, prismaPublic)
    return NextResponse.json({ userId: user.id })
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message ?? '입력값이 올바르지 않아요' },
        { status: 400 },
      )
    }
    return NextResponse.json({ error: '로그인에 실패했어요' }, { status: 400 })
  }
}
