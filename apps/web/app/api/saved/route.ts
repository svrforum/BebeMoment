import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { resolveContext } from '@/server/context'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor') ?? undefined
  const limit = Number(url.searchParams.get('limit') ?? '30')
  const page = await listMyBookmarks(
    ctx.family.id,
    ctx.user.id,
    { ...(cursor ? { cursor } : {}), limit },
    prismaPublic,
    prismaMedia,
  )
  return NextResponse.json(page)
}
