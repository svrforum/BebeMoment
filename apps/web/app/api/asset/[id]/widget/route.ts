import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { resolveContext } from '@/server/context'
import { toggleWidgetPhoto } from '@/server/widget/collection'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const { id } = await params
    const result = await toggleWidgetPhoto(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
