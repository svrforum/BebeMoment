import { getAuth } from '@/lib/auth'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { toggleBookmark } from '@/server/bookmark/toggle'
import { resolveContext } from '@/server/context'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return await errorJsonKey('unauthorized', 401)
  if (!(await isFeatureEnabled('bookmarks', prismaPublic)))
    return await errorJsonKey('featureOff.bookmarks', 403)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return await errorJsonKey('noFamily', 400)
  try {
    const { id } = await params
    const result = await toggleBookmark(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
