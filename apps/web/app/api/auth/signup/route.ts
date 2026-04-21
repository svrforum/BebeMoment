import { prisma } from '@/lib/db-init'
import { createSessionAndSetCookie } from '@/lib/session-cookie'
import { signup } from '@/server/auth/signup'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { user } = await signup(body, prisma)
    await createSessionAndSetCookie(user.id)
    return NextResponse.json({ userId: user.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Signup failed'
    const status = message.match(/already|password|email/i) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
