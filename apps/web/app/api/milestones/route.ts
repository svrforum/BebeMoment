import { requireRouteContext } from '@/lib/route-context'
import { errorJson } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { createMilestone } from '@/server/milestone/create'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const body = await req.json()
    const ms = await createMilestone(
      { ...body, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ id: ms.id })
  } catch (e) {
    return errorJson(e)
  }
}
