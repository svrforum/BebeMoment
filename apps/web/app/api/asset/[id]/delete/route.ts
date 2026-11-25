import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { softDeleteAsset } from '@/server/asset/soft-delete'
import { errorJson } from '@/lib/error-response'
import { getPublisher } from '@/server/upload/pubsub'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    await softDeleteAsset(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
      getPublisher(),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
