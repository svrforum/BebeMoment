import { getAuth } from '@/lib/auth'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { createMilestone } from '@/server/milestone/create'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return await errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return await errorJsonKey('noFamily', 400)
  try {
    const body = await req.json()
    const ms = await createMilestone(
      { ...body, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ id: ms.id })
  } catch (e) {
    return errorJson(e)
  }
}
