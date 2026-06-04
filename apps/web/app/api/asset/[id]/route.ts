import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { updateAssetMetadata } from '@/server/asset/update-metadata'
import { resolveContext } from '@/server/context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
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
