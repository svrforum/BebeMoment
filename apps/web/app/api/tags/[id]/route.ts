import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { toHttpError } from '@/server/error'
import { deleteTag } from '@/server/tag/delete'
import { renameTag } from '@/server/tag/rename'
import { NextResponse } from 'next/server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user)
    return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { id } = await params
    const body = (await req.json()) as { name?: string }
    if (!body.name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }
    const tag = await renameTag(
      { tagId: id, familyId: ctx.family.id, byUserId: ctx.user.id, name: body.name },
      prismaPublic,
    )
    return NextResponse.json({ tag })
  } catch (e) {
    { const { status, message } = toHttpError(e); return NextResponse.json({ error: message }, { status }) }
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user)
    return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { id } = await params
    const result = await deleteTag(
      { tagId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json(result)
  } catch (e) {
    { const { status, message } = toHttpError(e); return NextResponse.json({ error: message }, { status }) }
  }
}
