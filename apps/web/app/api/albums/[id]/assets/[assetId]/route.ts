import { requireRouteContext } from '@/lib/route-context'
import { prismaPublic } from '@/lib/db-init'
import { detachAssetFromAlbum } from '@/server/album/detach-asset'
import { errorJson } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id, assetId } = await params
    const result = await detachAssetFromAlbum(
      {
        albumId: id,
        assetId,
        familyId: ctx.family.id,
        byUserId: ctx.user.id,
      },
      prismaPublic,
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
