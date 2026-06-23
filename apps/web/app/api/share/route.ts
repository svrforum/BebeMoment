import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { type ShareTarget, createShareLink } from '@/server/share/create'
import { listShareLinks } from '@/server/share/manage'
import { isShareTtl } from '@/server/share/token'
import { isFeatureEnabled } from '@/server/settings/features'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type CtxError = { errorKey: string; status: number }
async function getCtx(): Promise<CtxError | { ctx: Awaited<ReturnType<typeof resolveContext>> }> {
  const { session } = await getAuth()
  if (!session) return { errorKey: 'unauthorized', status: 401 }
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return { errorKey: 'noFamily', status: 400 }
  return { ctx }
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
  if (!(await isFeatureEnabled('share', prismaPublic))) return errorJsonKey('share.featureOff', 403)
  const r = await getCtx()
  if ('errorKey' in r) return errorJsonKey(r.errorKey, r.status)
  // 공유 토큰은 인증 경계 밖 접근 자격 — 발행 권한(share.create) 없는 역할이 기존 토큰을
  // 열거(예: ?date 로)해 외부 유출하지 못하게, POST 와 동일하게 게이트.
  if (!r.ctx.capabilities.includes('share.create')) return errorJsonKey('forbidden', 403)
  const target = targetFromQuery(new URL(req.url))
  if (!target) return errorJsonKey('share.targetRequired', 400)
  const links = await listShareLinks(target, r.ctx.family!.id, prismaPublic)
  return NextResponse.json({ links })
}

export async function POST(req: Request) {
  if (!(await isFeatureEnabled('share', prismaPublic))) return errorJsonKey('share.featureOff', 403)
  const r = await getCtx()
  if ('errorKey' in r) return errorJsonKey(r.errorKey, r.status)
  // 공유 링크 발행은 인증 경계 밖 노출이라 역할 게이트가 필요하다(owner/guardian 기본,
  // family 는 관리자가 share.create 를 부여한 경우만). 보기 전용 family 가 영구 공개
  // 링크를 만들던 갭을 막는다.
  if (!r.ctx.capabilities.includes('share.create')) return errorJsonKey('forbidden', 403)
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
    return errorJson(e)
  }
}
