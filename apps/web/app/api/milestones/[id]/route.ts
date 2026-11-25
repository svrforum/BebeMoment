import { requireRouteContext } from '@/lib/route-context'
import { errorJson } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { softDeleteMilestone } from '@/server/milestone/soft-delete'
import { updateMilestone } from '@/server/milestone/update'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    const patch = await req.json()
    const ms = await updateMilestone(
      { id, familyId: ctx.family.id, byUserId: ctx.user.id, patch },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ id: ms.id })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    await softDeleteMilestone({ id, familyId: ctx.family.id, byUserId: ctx.user.id }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
