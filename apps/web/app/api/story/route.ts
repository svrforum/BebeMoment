import { getAuth } from '@/lib/auth'
import { errorJson } from '@/lib/error-response'
import { jsonBig } from '@/lib/json-big'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { createStoryEntry } from '@/server/story/create'
import { listStoryEntries } from '@/server/story/list'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return NextResponse.json({ error: 'No family' }, { status: 400 })
  const url = new URL(req.url)
  const babyId = url.searchParams.get('babyId') ?? undefined
  const cursor = url.searchParams.get('cursor') ?? undefined
  const q = url.searchParams.get('q')?.trim() || undefined
  const date = url.searchParams.get('date')?.trim() || undefined
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 20), 100)
  const page = await listStoryEntries(
    ctx.family.id,
    {
      ...(babyId ? { babyId } : {}),
      ...(cursor ? { cursor } : {}),
      ...(q ? { q } : {}),
      ...(date ? { date } : {}),
      limit,
      viewerRole: ctx.membership?.role ?? 'family',
    },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )
  return jsonBig(page)
}

export async function POST(req: Request) {
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
    const body = await req.json()
    const entry = await createStoryEntry(
      { ...body, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ id: entry.id })
  } catch (e) {
    return errorJson(e)
  }
}
