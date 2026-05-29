import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { resolveContext } from '@/server/context'
import { toHttpError } from '@/server/error'
import { suspendMember } from '@/server/member-admin/suspend'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const Body = z.object({ reason: z.string().max(200).optional() })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { session } = await getAuth()
  const ctx = await resolveContext(
    { userId: session?.userId ?? null, currentFamilyId: session?.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { membershipId } = await params
    const { reason } = Body.parse(await req.json().catch(() => ({})))
    const result = await suspendMember(
      {
        membershipId,
        familyId: ctx.family.id,
        actorUserId: ctx.user.id,
        ...(reason !== undefined ? { reason } : {}),
      },
      prismaPublic,
    )
    return NextResponse.json({ ok: true, suspendedAt: result.suspendedAt })
  } catch (e) {
    const { status, message } = toHttpError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
