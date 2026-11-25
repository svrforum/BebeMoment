import { requireRouteContext } from '@/lib/route-context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { toggleLike } from '@/server/like/toggle'
import { isFeatureEnabled } from '@/server/settings/features'
import { getPublisher } from '@/server/upload/pubsub'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('likes', prismaPublic)))
    return await errorJsonKey('featureOff.likes', 403)
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
