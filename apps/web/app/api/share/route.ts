import { errorKeyFromIssue } from '@/i18n/error-key'
import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import type { ShareTarget } from '@/lib/share-kind'
import { createShareLink } from '@/server/share/create'
import { listMyShareLinks, listShareLinks } from '@/server/share/manage'
import { isShareTtl } from '@/server/share/token'
import { isFeatureEnabled } from '@/server/settings/features'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { SHARE_SELECTION_MAX } from '@/lib/share-limits'
import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'

async function canShareSchedule(capabilities: readonly string[]): Promise<boolean> {
  return (
    capabilities.includes('schedule.read') && (await isFeatureEnabled('schedule', prismaPublic))
  )
}

const createSchema = z
  .object({
    storyId: z.string().uuid().optional(),
    assetId: z.string().uuid().optional(),
    albumId: z.string().uuid().optional(),
    assetIds: z.array(z.string().uuid()).min(1).max(SHARE_SELECTION_MAX).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    scheduleEntryId: z.string().uuid().optional(),
    ttl: z.string().refine(isShareTtl, 'errors.share.ttlInvalid'),
  })
  .refine((b) => {
    const given = [
      b.storyId,
      b.assetId,
      b.albumId,
      b.assetIds?.length ? b.assetIds : null,
      b.date,
      b.scheduleEntryId,
    ].filter(Boolean).length
    // 날짜 + 사진 목록은 한 대상이다 — 추억 묶음(그 날 사진 중 지금 보이는 것으로 고정).
    return given === (b.date && b.assetIds?.length ? 2 : 1)
  }, 'errors.share.targetOnlyOne')

function targetFromQuery(url: URL): ShareTarget | null {
  const q = url.searchParams
  const storyId = q.get('storyId')
  const assetId = q.get('assetId')
  const albumId = q.get('albumId')
  const date = q.get('date')
  const memoryDate = q.get('memoryDate')
  const scheduleEntryId = q.get('scheduleEntryId')
  if (scheduleEntryId) return { kind: 'schedule', entryId: scheduleEntryId }
  if (storyId) return { kind: 'story', storyId }
  if (assetId) return { kind: 'asset', assetId }
  if (albumId) return { kind: 'album', albumId }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: 'date', date }
  if (memoryDate && /^\d{4}-\d{2}-\d{2}$/.test(memoryDate))
    return { kind: 'memory', date: memoryDate, assetIds: [] }
  return null
}

export async function GET(req: Request) {
  if (!(await isFeatureEnabled('share', prismaPublic))) return errorJsonKey('share.featureOff', 403)
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  const url = new URL(req.url)
  // `?mine=1` — 본인이 발행한 링크만(선택 링크 포함). 타인 토큰 열거가 아니라 자기 회수용이라
  // share.create 게이트가 필요 없다. 선택 링크는 per-target 경로로는 안 보이던 갭을 메운다.
  if (url.searchParams.get('mine') === '1') {
    const links = await listMyShareLinks(ctx.family.id, ctx.user.id, prismaPublic)
    return NextResponse.json({ links })
  }
  // 공유 토큰은 인증 경계 밖 접근 자격 — 발행 권한(share.create) 없는 역할이 기존 토큰을
  // 열거(예: ?date 로)해 외부 유출하지 못하게, POST 와 동일하게 게이트.
  if (!ctx.capabilities.includes('share.create')) return errorJsonKey('forbidden', 403)
  const target = targetFromQuery(url)
  if (!target) return errorJsonKey('share.targetRequired', 400)
  if (target.kind === 'schedule' && !(await canShareSchedule(ctx.capabilities)))
    return errorJsonKey('forbidden', 403)
  const links = await listShareLinks(target, ctx.family.id, prismaPublic)
  return NextResponse.json({ links })
}

export async function POST(req: Request) {
  if (!(await isFeatureEnabled('share', prismaPublic))) return errorJsonKey('share.featureOff', 403)
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  // 공유 링크 발행은 인증 경계 밖 노출이라 역할 게이트가 필요하다(owner/guardian 기본,
  // family 는 관리자가 share.create 를 부여한 경우만). 보기 전용 family 가 영구 공개
  // 링크를 만들던 갭을 막는다.
  if (!ctx.capabilities.includes('share.create')) return errorJsonKey('forbidden', 403)
  try {
    const body = createSchema.parse(await req.json())
    const target: ShareTarget = body.storyId
      ? { kind: 'story', storyId: body.storyId }
      : body.assetId
        ? { kind: 'asset', assetId: body.assetId }
        : body.albumId
          ? { kind: 'album', albumId: body.albumId }
          : body.assetIds?.length
            ? body.date
              ? { kind: 'memory', date: body.date, assetIds: body.assetIds }
              : { kind: 'selection', assetIds: body.assetIds }
            : body.scheduleEntryId
              ? { kind: 'schedule', entryId: body.scheduleEntryId }
              : { kind: 'date', date: body.date as string }
    // 일정은 보호자 전용 기능이다. 공유 권한만으로는 부족하고, 그 일정을 볼 수 있는 사람이어야
    // 링크를 만든다 — 볼 수 없는 것을 밖으로 내보내는 경로가 생기면 안 된다.
    if (target.kind === 'schedule' && !(await canShareSchedule(ctx.capabilities)))
      return errorJsonKey('forbidden', 403)
    const { token, expiresAt } = await createShareLink(
      { target, familyId: ctx.family.id, userId: ctx.user.id, ttl: body.ttl },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ token, expiresAt })
  } catch (e) {
    if (e instanceof ZodError) {
      return await errorJsonKey(errorKeyFromIssue(e.issues[0]?.message), 400)
    }
    return errorJson(e)
  }
}
