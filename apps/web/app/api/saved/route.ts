import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { jsonBig } from '@/lib/json-big'
import { getMediaClient } from '@/lib/media-client'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor') ?? undefined
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 30), 100)
  const page = await listMyBookmarks(
    ctx.family.id,
    ctx.user.id,
    { ...(cursor ? { cursor } : {}), limit, viewerRole: ctx.membership.role },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )
  // asset.sizeBytes(BigInt)를 담고 있어 jsonBig 로 내보낸다(NextResponse.json 은 500).
  return jsonBig(page)
}
