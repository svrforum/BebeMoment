import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { detachAssetFromAlbum } from '@/server/album/detach-asset'
import { resolveContext } from '@/server/context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
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
