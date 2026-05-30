import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { unlinkIdentity } from '@/server/oidc/link'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const Body = z.object({ providerId: z.string().uuid() })

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { providerId } = Body.parse(await req.json())
    await unlinkIdentity(session.userId, providerId, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
