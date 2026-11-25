import { requireRouteContext } from '@/lib/route-context'
import { errorJson } from '@/lib/error-response'
import { prismaPublic } from '@/lib/db-init'
import { softDeleteGrowthRecord } from '@/server/growth/soft-delete'
import { updateGrowthRecord } from '@/server/growth/update'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    const patch = await req.json()
    const rec = await updateGrowthRecord(
      { id, familyId: ctx.family.id, byUserId: ctx.user.id, patch },
      prismaPublic,
    )
    return NextResponse.json({ id: rec.id })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    await softDeleteGrowthRecord(
      { id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
