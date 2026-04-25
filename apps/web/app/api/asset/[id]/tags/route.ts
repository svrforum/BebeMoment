import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { toHttpError } from '@/server/error'
import { attachTagsToAsset } from '@/server/tag/attach'
import { createOrGetTag } from '@/server/tag/create'
import { listTagsForAsset } from '@/server/tag/list-for-asset'
import { NextResponse } from 'next/server'

export async function GET(
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
    const tags = await listTagsForAsset({ assetId: id, familyId: ctx.family.id }, prismaPublic)
    return NextResponse.json({ tags })
  } catch (e) {
    { const { status, message } = toHttpError(e); return NextResponse.json({ error: message }, { status }) }
  }
}

/**
 * Body shape variants:
 *   { tagIds: ["uuid", ...] }            — attach existing tags
 *   { name: "여행" }                      — create-or-get + attach in one call
 *
 * Mixed: { tagIds, name } attaches both.
 */
export async function POST(
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
    const body = (await req.json()) as { tagIds?: string[]; name?: string; color?: string }
    const tagIds: string[] = [...(body.tagIds ?? [])]

    if (body.name && body.name.trim()) {
      const created = await createOrGetTag(
        { familyId: ctx.family.id, byUserId: ctx.user.id, name: body.name, ...(body.color ? { color: body.color } : {}) },
        prismaPublic,
      )
      tagIds.push(created.id)
    }

    if (tagIds.length === 0) {
      return NextResponse.json({ error: 'tagIds or name required' }, { status: 400 })
    }

    const result = await attachTagsToAsset(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id, tagIds },
      prismaPublic,
      prismaMedia,
    )
    const tags = await listTagsForAsset({ assetId: id, familyId: ctx.family.id }, prismaPublic)
    return NextResponse.json({ ...result, tags })
  } catch (e) {
    { const { status, message } = toHttpError(e); return NextResponse.json({ error: message }, { status }) }
  }
}
