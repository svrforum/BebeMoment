import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { resolveContext } from '@/server/context'
import { toHttpError } from '@/server/error'
import { unsuspendMember } from '@/server/member-admin/unsuspend'
import { NextResponse } from 'next/server'

export async function POST(
  _req: Request,
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
    await unsuspendMember(
      { membershipId, familyId: ctx.family.id, actorUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    const { status, message } = toHttpError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
