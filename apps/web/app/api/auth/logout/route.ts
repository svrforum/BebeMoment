import { getAuth, lucia } from '@/lib/auth'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const { session } = await getAuth()
  if (session) {
    await lucia.invalidateSession(session.id)
  }
  const c = lucia.createBlankSessionCookie()
  ;(await cookies()).set(c.name, c.value, c.attributes)
  return NextResponse.json({ ok: true })
}
