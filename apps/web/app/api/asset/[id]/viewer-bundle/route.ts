import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { loadViewerBundle } from '@/server/asset/viewer-bundle'
import { loadViewerDetail } from '@/server/asset/viewer-detail'
import { resolveNeighborIds } from '@/server/asset/viewer-neighbors'
import { resolveStoryViewerCtx } from '@/server/asset/viewer-story-ctx'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const { id } = await params
    const sp = new URL(req.url).searchParams
    const sort = sp.get('sort') === 'uploaded' ? 'uploaded' : 'taken'
    const ctxParam = sp.get('ctx') ?? undefined
    const neighborIds = await resolveNeighborIds(
      ctxParam,
      {
        familyId: ctx.family.id,
        userId: ctx.user.id,
        viewerRole: ctx.membership?.role ?? 'family',
      },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    )
    const viewerRole = ctx.membership?.role ?? 'family'
    const bundle = await loadViewerBundle(
      {
        assetId: id,
        familyId: ctx.family.id,
        sort,
        viewerRole,
        ...(neighborIds ? { neighborIds } : {}),
      },
      prismaMedia,
      getMediaClient(),
      prismaPublic,
    )
    if (!bundle) return errorJsonKey('notFound', 404)

    const storyCtx = await resolveStoryViewerCtx(
      ctxParam,
      neighborIds,
      bundle.current.id,
      ctx.family.id,
      prismaPublic,
      viewerRole,
    )

    // 상세 페이지와 같은 것을 보여주므로 조립도 같은 서비스로 한다 — 갈라져 있던 시절
    // 위젯 담김 여부가 이쪽에만 빠져 스와이프 후 메뉴가 반대로 동작했다.
    const detail = await loadViewerDetail(
      { assetId: bundle.current.id, familyId: ctx.family.id, userId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    if (!detail) return errorJsonKey('notFound', 404)
    const assetRow = detail.asset
    const commentRows = await prismaPublic.assetComment.count({
      where: { assetId: bundle.current.id, familyId: ctx.family.id, deletedAt: null },
    })

    return NextResponse.json({
      ...bundle,
      social: {
        liked: detail.liked,
        likeCount: detail.likers.count,
        likers: detail.likers,
        bookmarked: detail.bookmarked,
        inWidget: detail.inWidget,
        commentCount: commentRows,
      },
      meta: {
        takenAt: assetRow.takenAt.toISOString(),
        takenAtSource: assetRow.takenAtSource,
        width: assetRow.width,
        height: assetRow.height,
        sizeBytes: assetRow.sizeBytes.toString(),
        mimeType: assetRow.mimeType,
        cameraMake: assetRow.cameraMake,
        cameraModel: assetRow.cameraModel,
        gpsLat: assetRow.gpsLat,
        gpsLng: assetRow.gpsLng,
        exifRaw: assetRow.exifRaw as Record<string, unknown> | null,
        babies: detail.babies,
      },
      filename: assetRow.originalFilename,
      caption: assetRow.caption,
      storyCtx,
      // 권한 판단은 서버가 한다 — 예전엔 uploadedByUserId 만 보내고 클라이언트가 판단하려
      // 했는데, 클라이언트엔 capability 도 뷰어 userId 도 없어 결국 처음 값을 그대로 쓰고
      // 스와이프해도 갱신되지 않았다(남의 사진에서 삭제 버튼이 남거나 반대로 사라졌다).
      canDelete:
        ctx.capabilities.includes('asset.delete.any') ||
        (assetRow.uploadedByUserId === ctx.user.id &&
          ctx.capabilities.includes('asset.delete.own')),
    })
  } catch (e) {
    return errorJson(e)
  }
}
