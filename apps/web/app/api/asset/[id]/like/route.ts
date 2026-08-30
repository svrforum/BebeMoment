import { getAuth } from '@/lib/auth'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { toggleLike } from '@/server/like/toggle'
import { isFeatureEnabled } from '@/server/settings/features'
import { getPublisher } from '@/server/upload/pubsub'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return await errorJsonKey('unauthorized', 401)
  if (!(await isFeatureEnabled('likes', prismaPublic)))
    return await errorJsonKey('featureOff.likes', 403)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return await errorJsonKey('noFamily', 400)
  try {
    const { id } = await params
    const result = await toggleLike(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
      getPublisher(),
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
