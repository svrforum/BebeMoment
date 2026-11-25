import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { updateAssetMetadata } from '@/server/asset/update-metadata'
import { errorJson } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    const body = await req.json()
    const result = await updateAssetMetadata(
      { ...body, assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
