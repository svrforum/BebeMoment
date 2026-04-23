import { ViewerShell } from '@/components/detail/viewer-shell'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { getAssetForFamily } from '@/server/asset/get'
import { listComments } from '@/server/comment/list'
import { resolveContext } from '@/server/context'
import { likersForAsset } from '@/server/like/list-for-asset'
import { can } from '@bebe/core'
import { notFound } from 'next/navigation'

export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session } = await getAuth()
  if (!session) return null
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) return null

  const asset = await getAssetForFamily({ assetId: id, familyId: ctx.family.id }, prisma)
  if (!asset) notFound()

  const derivs = (asset.derivatives as Record<string, string> | null) ?? {}
  const mediaUrl =
    asset.kind === 'video'
      ? `/media/${derivs.preview_video ?? asset.originalKey}`
      : `/media/${derivs.thumb_lg ?? asset.originalKey}`
  const posterUrl = derivs.poster ? `/media/${derivs.poster}` : undefined

  const [prevAsset, nextAsset, likers, commentsRaw, myLike, myBookmark, babyLinks, members] =
    await Promise.all([
      prisma.asset.findFirst({
        where: {
          familyId: ctx.family.id,
          deletedAt: null,
          status: 'ready',
          OR: [
            { takenAt: { gt: asset.takenAt } },
            { takenAt: asset.takenAt, id: { gt: asset.id } },
          ],
        },
        orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.asset.findFirst({
        where: {
          familyId: ctx.family.id,
          deletedAt: null,
          status: 'ready',
          OR: [
            { takenAt: { lt: asset.takenAt } },
            { takenAt: asset.takenAt, id: { lt: asset.id } },
          ],
        },
        orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      }),
      likersForAsset(ctx.family.id, asset.id, prisma),
      listComments(ctx.family.id, asset.id, prisma),
      prisma.assetLike.findUnique({
        where: { assetId_userId: { assetId: asset.id, userId: ctx.user.id } },
      }),
      prisma.assetBookmark.findUnique({
        where: { assetId_userId: { assetId: asset.id, userId: ctx.user.id } },
      }),
      prisma.assetBaby.findMany({
        where: { assetId: asset.id },
        include: { baby: { select: { id: true, name: true } } },
      }),
      prisma.membership.findMany({
        where: { familyId: ctx.family.id, deletedAt: null },
        include: { user: { select: { id: true, displayName: true } } },
      }),
    ])

  const familyMembers = members.map((m) => ({ id: m.user.id, displayName: m.user.displayName }))
  const babies = babyLinks.map((l) => ({ id: l.baby.id, name: l.baby.name }))

  const role = ctx.membership?.role ?? 'family'
  const canDeleteAny = can(role, 'social.comment.delete.any')

  const initialComments = commentsRaw.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  }))

  return (
    <ViewerShell
      current={{ id: asset.id, kind: asset.kind, mediaUrl, posterUrl }}
      siblings={{ prevId: prevAsset?.id, nextId: nextAsset?.id }}
      currentUserId={ctx.user.id}
      canDeleteAny={canDeleteAny}
      familyMembers={familyMembers}
      meta={{
        takenAt: asset.takenAt,
        takenAtSource: asset.takenAtSource,
        width: asset.width,
        height: asset.height,
        sizeBytes: asset.sizeBytes,
        mimeType: asset.mimeType,
        cameraMake: asset.cameraMake,
        cameraModel: asset.cameraModel,
        gpsLat: asset.gpsLat,
        gpsLng: asset.gpsLng,
        exifRaw: asset.exifRaw as Record<string, unknown> | null,
        babies,
      }}
      likers={likers}
      initialLiked={!!myLike}
      initialBookmarked={!!myBookmark}
      initialComments={initialComments}
    />
  )
}
