import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { jsonBig } from '@/lib/json-big'
import { getMediaClient } from '@/lib/media-client'
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
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 30), 100)
  const page = await listMyBookmarks(
    ctx.family.id,
    ctx.user.id,
    { ...(cursor ? { cursor } : {}), limit, viewerRole: ctx.membership?.role ?? 'family' },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )
  // asset.sizeBytes(BigInt)를 담고 있어 jsonBig 로 내보낸다(NextResponse.json 은 500).
  return jsonBig(page)
}
