import { requireRouteContext } from '@/lib/route-context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { prismaPublic } from '@/lib/db-init'
import { toggleStoryBookmark } from '@/server/story-bookmark/toggle'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('bookmarks', prismaPublic)))
    return await errorJsonKey('featureOff.bookmarks', 403)
  try {
    const { id } = await params
    const result = await toggleStoryBookmark(
      { entryId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
