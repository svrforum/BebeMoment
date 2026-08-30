import { errorJsonKey } from '@/lib/error-response'
import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { buildTimelineGroups } from '@/server/timeline/build-groups'
import { listTimeline } from '@/server/timeline/merged-list'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 타임라인 무한스크롤 load-more. 커서로 다음 페이지를 가져와 SSR 과 동일한 버킷
 * 그룹으로 변환해 반환한다(클라가 이어붙임).
 */
export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return await errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.membership) return await errorJsonKey('noFamily', 400)

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor') ?? undefined
  const sortMode = url.searchParams.get('sort') === 'uploaded' ? 'uploaded' : 'taken'
  const dateParam = url.searchParams.get('date')
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined

  const baby = await prismaPublic.baby.findFirst({
    where: { familyId: ctx.family.id, deletedAt: null },
    orderBy: { birthDate: 'asc' },
    select: { birthDate: true },
  })

  const { items, nextCursor } = await listTimeline(
    ctx.family.id,
    {
      limit: 60,
      viewerRole: ctx.membership.role,
      sort: sortMode,
      ...(cursor ? { cursor } : {}),
      ...(date ? { date } : {}),
    },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )

  const groups = buildTimelineGroups({
    items,
    birthDate: baby?.birthDate ?? null,
    sortMode,
    includeStories: !date,
  })
  return NextResponse.json({ groups, nextCursor })
}
