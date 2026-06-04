import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { attachAssetsToAlbum } from '@/server/album/attach-assets'
import { resolveContext } from '@/server/context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { isFeatureEnabled } from '@/server/settings/features'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  if (!(await isFeatureEnabled('albums', prismaPublic)))
    return errorJsonKey('album.featureOff', 403)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const { id } = await params
    const body = (await req.json()) as { assetIds: string[] }
    const result = await attachAssetsToAlbum(
      {
        albumId: id,
        familyId: ctx.family.id,
        byUserId: ctx.user.id,
        assetIds: body.assetIds,
      },
      prismaPublic,
      prismaMedia,
    )
    revalidatePath('/albums', 'layout')
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
