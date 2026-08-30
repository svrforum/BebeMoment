import { getAuth } from '@/lib/auth'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { prismaPublic } from '@/lib/db-init'
import { softDeleteComment } from '@/server/comment/soft-delete'
import { updateComment } from '@/server/comment/update'
import { resolveContext } from '@/server/context'
import { getPublisher } from '@/server/upload/pubsub'
import { NextResponse } from 'next/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { session } = await getAuth()
  if (!session) return await errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return await errorJsonKey('noFamily', 400)
  try {
    const { cid } = await params
    const body = await req.json()
    const c = await updateComment(
      { id: cid, familyId: ctx.family.id, body: body.body, byUserId: ctx.user.id },
      prismaPublic,
      getPublisher(),
    )
    return NextResponse.json({ id: c.id })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { session } = await getAuth()
  if (!session) return await errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return await errorJsonKey('noFamily', 400)
  try {
    const { cid } = await params
    await softDeleteComment(
      { id: cid, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      getPublisher(),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
