import { getAuth } from '@/lib/auth'
import { errorJson } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { getStoryEntry } from '@/server/story/get'
import { softDeleteStoryEntry } from '@/server/story/soft-delete'
import { updateStoryEntry } from '@/server/story/update'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return NextResponse.json({ error: 'No family' }, { status: 400 })
  const { id } = await params
  const entry = await getStoryEntry(
    id,
    ctx.family.id,
    prismaPublic,
    prismaMedia,
    getMediaClient(),
    ctx.membership?.role ?? 'family',
  )
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(entry)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isFeatureEnabled('diary', prismaPublic)))
    return NextResponse.json({ error: '스토리 기능이 꺼져 있어요' }, { status: 403 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
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
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isFeatureEnabled('diary', prismaPublic)))
    return NextResponse.json({ error: '스토리 기능이 꺼져 있어요' }, { status: 403 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { id } = await params
    await softDeleteStoryEntry({ id, familyId: ctx.family.id, byUserId: ctx.user.id }, prismaPublic)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
