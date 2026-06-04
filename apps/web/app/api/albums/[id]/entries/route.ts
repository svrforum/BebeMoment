import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { attachEntriesToAlbum } from '@/server/album/attach-entries'
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
    const body = (await req.json()) as { entryIds: string[] }
    const result = await attachEntriesToAlbum(
      { albumId: id, familyId: ctx.family.id, byUserId: ctx.user.id, entryIds: body.entryIds },
      prismaPublic,
    )
    revalidatePath('/albums', 'layout')
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
