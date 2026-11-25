import { requireRouteContext } from '@/lib/route-context'
import { prismaPublic } from '@/lib/db-init'
import { errorJson } from '@/lib/error-response'
import { revokeInvite } from '@/server/invite/revoke'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    await revokeInvite(
      { inviteId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
