import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
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
    { ...(cursor ? { cursor } : {}), limit },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )
  // asset.sizeBytes 는 BigInt 라 NextResponse.json(JSON.stringify) 이 직렬화하지 못해
  // 500 이 났다(북마크에 살아있는 사진이 1장이라도 있으면 재현). BigInt→Number 로 변환.
  return new NextResponse(
    JSON.stringify(page, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
    { headers: { 'content-type': 'application/json' } },
  )
}
