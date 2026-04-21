import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { createInvite } from '@/server/invite/create'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({
  email: z.string().email(),
  role: z.enum(['guardian', 'family']),
})

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user)
    return NextResponse.json({ error: 'No current family' }, { status: 400 })

  try {
    const body = BodySchema.parse(await req.json())
    const invite = await createInvite(
      {
        familyId: ctx.family.id,
        email: body.email,
        role: body.role,
        byUserId: ctx.user.id,
      },
      prisma,
    )
    return NextResponse.json({
      id: invite.id,
      token: invite.token,
      expiresAt: invite.expiresAt,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
