import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { createDiaryEntry } from '@/server/diary/create'
import { listDiaryEntries } from '@/server/diary/list'
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
  const limit = Number(url.searchParams.get('limit') ?? '20')
  const page = await listDiaryEntries(
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
  return NextResponse.json(page)
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
    const entry = await createDiaryEntry(
      { ...body, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ id: entry.id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
