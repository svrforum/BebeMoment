import { requireRouteContext } from '@/lib/route-context'
import { prismaPublic } from '@/lib/db-init'
import { errorJson } from '@/lib/error-response'
import { createInvite } from '@/server/invite/create'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BodySchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['guardian', 'family']),
})

export async function POST(req: Request) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx

  try {
    const body = BodySchema.parse(await req.json())
    const invite = await createInvite(
      {
        familyId: ctx.family.id,
        email: body.email,
        role: body.role,
        byUserId: ctx.user.id,
      },
      prismaPublic,
    )
    return NextResponse.json({
      id: invite.id,
      token: invite.token,
      expiresAt: invite.expiresAt,
    })
  } catch (e) {
    return errorJson(e)
  }
}
