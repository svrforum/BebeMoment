import { lucia } from '@/lib/auth'
import { login } from '@/server/auth/login'
import { prisma } from '@bebe/db'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { user } = await login(body, prisma)

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, deletedAt: null },
      orderBy: { joinedAt: 'asc' },
    })

    const session = await lucia.createSession(user.id, {
      current_family_id: membership?.familyId ?? null,
    })
    const c = lucia.createSessionCookie(session.id)
    ;(await cookies()).set(c.name, c.value, c.attributes)

    return NextResponse.json({ userId: user.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Login failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
