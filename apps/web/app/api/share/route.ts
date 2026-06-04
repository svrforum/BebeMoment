import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { createShareLink } from '@/server/share/create'
import { listShareLinks } from '@/server/share/manage'
import { isShareTtl } from '@/server/share/token'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'
import { z } from 'zod'

async function getCtx() {
  const { session } = await getAuth()
  if (!session) return { error: 'Unauthorized', status: 401 } as const
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return { error: 'No family', status: 400 } as const
  return { ctx } as const
}

const createSchema = z.object({
  storyId: z.string().uuid(),
  ttl: z.string().refine(isShareTtl, '유효하지 않은 기간'),
})

export async function GET(req: Request) {
  if (!(await isFeatureEnabled('share', prismaPublic)))
    return NextResponse.json({ error: '공유 기능이 꺼져 있어요' }, { status: 403 })
  const r = await getCtx()
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status as number })
  const storyId = new URL(req.url).searchParams.get('storyId')
  if (!storyId) return NextResponse.json({ error: 'storyId 필요' }, { status: 400 })
  const links = await listShareLinks(storyId, r.ctx.family!.id, prismaPublic)
  return NextResponse.json({ links })
}

export async function POST(req: Request) {
  if (!(await isFeatureEnabled('share', prismaPublic)))
    return NextResponse.json({ error: '공유 기능이 꺼져 있어요' }, { status: 403 })
  const r = await getCtx()
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status as number })
  try {
    const { storyId, ttl } = createSchema.parse(await req.json())
    const { token, expiresAt } = await createShareLink(
      { storyId, familyId: r.ctx.family!.id, userId: r.ctx.user!.id, ttl },
      prismaPublic,
    )
    return NextResponse.json({ token, expiresAt })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
