import { auth } from '@/lib/auth-config'
import { prismaPublic } from '@/lib/db-init'
import { isRegistrationOpen, validateInviteForSignup } from '@/server/auth/registration'
import { setCurrentFamilyOnLatestSession } from '@/lib/session-cookie'
import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

const SignupInput = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 해요'),
  displayName: z.string().min(1, '이름을 입력해주세요').max(80),
  inviteToken: z.string().min(1).optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const input = SignupInput.parse(body)

    const open = await isRegistrationOpen(prismaPublic)
    if (!open) {
      const okInvite = input.inviteToken
        ? await validateInviteForSignup(input.inviteToken, input.email, prismaPublic)
        : false
      if (!okInvite) {
        return NextResponse.json(
          { error: '공개 가입이 닫혀 있어요. 초대 링크로 가입해주세요.' },
          { status: 403 },
        )
      }
    }

    // Better Auth hashes via emailAndPassword.password.hash (bcryptjs), creates
    // the user + credential account, auto-signs-in, and (via nextCookies) sets
    // the session cookie.
    const result = await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.displayName },
      headers: await headers(),
    })

    await setCurrentFamilyOnLatestSession(result.user.id, prismaPublic)

    return NextResponse.json({ userId: result.user.id })
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues[0]
      return NextResponse.json(
        { error: first?.message ?? '입력값이 올바르지 않아요' },
        { status: 400 },
      )
    }
    if (e instanceof APIError) {
      const code = (e.body as { code?: string } | undefined)?.code
      if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
        return NextResponse.json({ error: '이미 가입된 이메일이에요' }, { status: 400 })
      }
      if (code === 'PASSWORD_TOO_SHORT') {
        return NextResponse.json({ error: '비밀번호는 8자 이상이어야 해요' }, { status: 400 })
      }
      return NextResponse.json({ error: '가입에 실패했어요' }, { status: 400 })
    }
    const message = e instanceof Error ? e.message : '가입에 실패했어요'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
