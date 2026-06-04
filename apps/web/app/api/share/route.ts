import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { type ShareTarget, createShareLink } from '@/server/share/create'
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

const createSchema = z
  .object({
    storyId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    albumId: z.string().uuid().optional(),
    assetIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    ttl: z.string().refine(isShareTtl, '유효하지 않은 기간'),
  })
  .refine(
    (b) =>
      [b.storyId, b.assetId, b.albumId, b.assetIds?.length ? b.assetIds : null, b.date].filter(
        Boolean,
      ).length === 1,
    '공유 대상은 하나만',
  )

function targetFromQuery(url: URL): ShareTarget | null {
  const q = url.searchParams
  const storyId = q.get('storyId')
  const assetId = q.get('assetId')
  const albumId = q.get('albumId')
  const date = q.get('date')
  if (storyId) return { kind: 'story', storyId }
  if (assetId) return { kind: 'asset', assetId }
  if (albumId) return { kind: 'album', albumId }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: 'date', date }
  return null
}

export async function GET(req: Request) {
  if (!(await isFeatureEnabled('share', prismaPublic)))
    return NextResponse.json({ error: '공유 기능이 꺼져 있어요' }, { status: 403 })
  const r = await getCtx()
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status as number })
  const target = targetFromQuery(new URL(req.url))
  if (!target) return NextResponse.json({ error: 'storyId 또는 assetId 필요' }, { status: 400 })
  const links = await listShareLinks(target, r.ctx.family!.id, prismaPublic)
  return NextResponse.json({ links })
}

export async function POST(req: Request) {
  if (!(await isFeatureEnabled('share', prismaPublic)))
    return NextResponse.json({ error: '공유 기능이 꺼져 있어요' }, { status: 403 })
  const r = await getCtx()
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status as number })
  try {
    const body = createSchema.parse(await req.json())
    const target: ShareTarget = body.storyId
      ? { kind: 'story', storyId: body.storyId }
      : body.assetId
        ? { kind: 'asset', assetId: body.assetId }
        : body.albumId
          ? { kind: 'album', albumId: body.albumId }
          : body.assetIds?.length
            ? { kind: 'selection', assetIds: body.assetIds }
            : { kind: 'date', date: body.date as string }
    const { token, expiresAt } = await createShareLink(
      { target, familyId: r.ctx.family!.id, userId: r.ctx.user!.id, ttl: body.ttl },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ token, expiresAt })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
