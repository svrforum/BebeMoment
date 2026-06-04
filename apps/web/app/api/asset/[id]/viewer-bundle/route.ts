import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { loadViewerBundle } from '@/server/asset/viewer-bundle'
import { resolveNeighborIds } from '@/server/asset/viewer-neighbors'
import { resolveStoryViewerCtx } from '@/server/asset/viewer-story-ctx'
import { likersForAsset } from '@/server/like/list-for-asset'
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
    const bundle = await loadViewerBundle(
      { assetId: id, familyId: ctx.family.id, sort, ...(neighborIds ? { neighborIds } : {}) },
      prismaMedia,
      getMediaClient(),
    )
    if (!bundle) return errorJsonKey('notFound', 404)

    const storyCtx = await resolveStoryViewerCtx(
      ctxParam,
      neighborIds,
      bundle.current.id,
      ctx.family.id,
      prismaPublic,
    )

    // 새 자산의 social state (좋아요·북마크·댓글수·좋아요 목록) — chrome 컴포넌트가
    // 마운트 시 자체 fetch 하지 않으므로 ViewerShell 이 navigateTo 응답으로 controlled
    // state 를 갱신한다.
    // full asset row for meta (taken-at, dims, exif, camera, gps, filename, caption)
    const assetRow = await prismaMedia.asset.findFirst({
      where: { id: bundle.current.id, familyId: ctx.family.id, deletedAt: null },
    })
    if (!assetRow) return errorJsonKey('notFound', 404)

    const [likers, myLike, myBookmark, commentRows, assetBabyLinks] = await Promise.all([
      likersForAsset(ctx.family.id, bundle.current.id, prismaPublic),
      prismaPublic.assetLike.findFirst({
        where: { assetId: bundle.current.id, userId: ctx.user.id, familyId: ctx.family.id },
      }),
      prismaPublic.assetBookmark.findFirst({
        where: { assetId: bundle.current.id, userId: ctx.user.id, familyId: ctx.family.id },
      }),
      prismaPublic.assetComment.count({
        where: {
          assetId: bundle.current.id,
          familyId: ctx.family.id,
          deletedAt: null,
        },
      }),
      prismaMedia.assetBaby.findMany({
        where: { assetId: bundle.current.id },
        select: { babyId: true },
      }),
    ])

    const babyIds = assetBabyLinks.map((l) => l.babyId)
    const babyRows = babyIds.length
      ? await prismaPublic.baby.findMany({
          where: { id: { in: babyIds }, familyId: ctx.family.id },
          select: { id: true, name: true },
        })
      : []

    return NextResponse.json({
      ...bundle,
      social: {
        liked: !!myLike,
        likeCount: likers.count,
        likers,
        bookmarked: !!myBookmark,
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
        babies: babyRows.map((b) => ({ id: b.id, name: b.name })),
      },
      filename: assetRow.originalFilename,
      caption: assetRow.caption,
      storyCtx,
      canDelete: {
        uploadedByUserId: assetRow.uploadedByUserId,
      },
    })
  } catch (e) {
    return errorJson(e)
  }
}
