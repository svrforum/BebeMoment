import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { requireAdmin } from '@/lib/require-admin'
import { resolveContext } from '@/server/context'
import { changeMemberRole } from '@/server/member-admin/change-role'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const Body = z.object({ role: z.enum(['guardian', 'family']) })

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
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const { membershipId } = await params
    const { role } = Body.parse(await req.json().catch(() => ({})))
    const result = await changeMemberRole(
      { membershipId, familyId: ctx.family.id, actorUserId: ctx.user.id, role },
      prismaPublic,
    )
    return NextResponse.json({ ok: true, role: result.role })
  } catch (e) {
    return errorJson(e)
  }
}
