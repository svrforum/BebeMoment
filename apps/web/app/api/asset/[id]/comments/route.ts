import { requireRouteContext } from '@/lib/route-context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { createComment } from '@/server/comment/create'
import { listComments } from '@/server/comment/list'
import { isFeatureEnabled } from '@/server/settings/features'
import { isAssetHiddenFromViewer } from '@/server/story/secret-assets'
import { getPublisher } from '@/server/upload/pubsub'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params
  // 비밀 스토리(guardians) 사진은 family 역할에게 숨긴다 — 댓글 목록도 마찬가지(생성·
  // 다운로드 경로와 대칭). id 를 직접 쳐도 404 로 막는 defense-in-depth.
  if (
    ctx.membership.role === 'family' &&
    (await isAssetHiddenFromViewer('family', id, prismaPublic, ctx.family.id))
  ) {
    return await errorJsonKey('notFound', 404)
  }
  const items = await listComments(ctx.family.id, id, prismaPublic)
  return NextResponse.json({ items })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('comments', prismaPublic)))
    return await errorJsonKey('featureOff.comments', 403)
  try {
    const { id } = await params
    const body = await req.json()
    const c = await createComment(
      { assetId: id, familyId: ctx.family.id, body: body.body, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
      getPublisher(),
    )
    return NextResponse.json({ id: c.id })
  } catch (e) {
    return errorJson(e)
  }
}
