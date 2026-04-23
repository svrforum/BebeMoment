import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
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
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { cid } = await params
    const body = await req.json()
    const c = await updateComment(
      { id: cid, familyId: ctx.family.id, body: body.body, byUserId: ctx.user.id },
      prisma,
      getPublisher(),
    )
    return NextResponse.json({ id: c.id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { cid } = await params
    await softDeleteComment(
      { id: cid, familyId: ctx.family.id, byUserId: ctx.user.id },
      prisma,
      getPublisher(),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
