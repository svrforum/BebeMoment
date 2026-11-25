import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { errorJson } from '@/lib/error-response'
import { toggleWidgetPhoto } from '@/server/widget/collection'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    const result = await toggleWidgetPhoto(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
