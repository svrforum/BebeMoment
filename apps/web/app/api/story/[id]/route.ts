import { requireRouteContext } from '@/lib/route-context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { jsonBig } from '@/lib/json-big'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getStoryEntry } from '@/server/story/get'
import { softDeleteStoryEntry } from '@/server/story/soft-delete'
import { updateStoryEntry } from '@/server/story/update'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  const entry = await getStoryEntry(
    id,
    ctx.family.id,
    prismaPublic,
    prismaMedia,
    getMediaClient(),
    ctx.membership.role,
  )
  if (!entry) return await errorJsonKey('notFound', 404)
  return jsonBig(entry)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('diary', prismaPublic)))
    return await errorJsonKey('featureOff.story', 403)
  try {
    const { id } = await params
    const patch = await req.json()
    const entry = await updateStoryEntry(
      { id, familyId: ctx.family.id, byUserId: ctx.user.id, patch },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ id: entry.id, publicNo: entry.publicNo })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('diary', prismaPublic)))
    return await errorJsonKey('featureOff.story', 403)
  try {
    const { id } = await params
    await softDeleteStoryEntry({ id, familyId: ctx.family.id, byUserId: ctx.user.id }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
