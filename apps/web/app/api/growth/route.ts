import { requireRouteContext } from '@/lib/route-context'
import { errorJson } from '@/lib/error-response'
import { prismaPublic } from '@/lib/db-init'
import { createGrowthRecord } from '@/server/growth/create'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = await req.json()
    const rec = await createGrowthRecord(
      { ...body, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json({ id: rec.id })
  } catch (e) {
    return errorJson(e)
  }
}
