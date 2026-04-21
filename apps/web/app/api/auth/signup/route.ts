import { lucia } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { signup } from '@/server/auth/signup'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { user } = await signup(body, prisma)

    const session = await lucia.createSession(user.id, { currentFamilyId: null })
    const c = lucia.createSessionCookie(session.id)
    ;(await cookies()).set(c.name, c.value, c.attributes)

    return NextResponse.json({ userId: user.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Signup failed'
    const status = message.match(/already|password|email/i) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
