import { prismaPublic } from '@/lib/db-init'
import { createSessionAndSetCookie } from '@/lib/oidc-session'
import { setCurrentFamilyOnLatestSession } from '@/lib/session-cookie'
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
  try {
    const input = SignupInput.parse(await req.json())

    const open = await isRegistrationOpen(prismaPublic)
    if (!open) {
      const okInvite = input.inviteToken
        ? await validateInviteForSignup(input.inviteToken, prismaPublic)
        : false
      if (!okInvite) {
        return NextResponse.json(
          { error: '공개 가입이 닫혀 있어요. 초대 링크로 가입해주세요.' },
          { status: 403 },
        )
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
    const message = e instanceof Error ? e.message : '가입에 실패했어요'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
