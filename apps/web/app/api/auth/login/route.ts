import { auth } from '@/lib/auth-config'
import { setCurrentFamilyOnLatestSession } from '@/lib/session-cookie'
import { prismaPublic } from '@/lib/db-init'
import { APIError } from 'better-auth/api'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const input = LoginInput.parse(body)

    // Better Auth verifies the bcrypt hash (via emailAndPassword.password.verify)
    // and, because nextCookies() is installed, sets the session cookie.
    const result = await auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: await headers(),
    })

    await setCurrentFamilyOnLatestSession(result.user.id, prismaPublic)

    return NextResponse.json({ userId: result.user.id })
  } catch (e) {
    if (e instanceof APIError) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 400 })
    }
    const message = e instanceof Error ? e.message : 'Login failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
