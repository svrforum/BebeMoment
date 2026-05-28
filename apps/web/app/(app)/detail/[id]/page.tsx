import { ViewerShell } from '@/components/detail/viewer-shell'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { loadViewerBundle } from '@/server/asset/viewer-bundle'
import { listComments } from '@/server/comment/list'
import { getContext } from '@/server/context'
import { likersForAsset } from '@/server/like/list-for-asset'
import { getSetting } from '@/server/settings/get'
import { listTagsForAsset } from '@/server/tag/list-for-asset'
import { notFound } from 'next/navigation'
import { z } from 'zod'

export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // getContext() is `cache()`-wrapped so layout + page share one fetch.
  // resolveContext() called directly would duplicate the user/membership
  // queries on every detail navigation.
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) return null

  const media = getMediaClient()
  // loadViewerBundle = current asset + adjacent prev/next slims (shared with
  // /api/asset/[id]/viewer-bundle so client-side swipe gets identical shape).
  const bundle = await loadViewerBundle(
    { assetId: id, familyId: ctx.family.id },
    prismaMedia,
    media,
  )
  if (!bundle) notFound()

  // For metadata / babies we still need the full asset row — fetch directly.
  const asset = await prismaMedia.asset.findFirst({
    where: { id, familyId: ctx.family.id, deletedAt: null },
  })
  if (!asset) notFound()

  const [
    likers,
    commentsRaw,
    myLike,
    myBookmark,
    assetBabyLinks,
    members,
    initialTags,
    compressEnabled,
  ] = await Promise.all([
    likersForAsset(ctx.family.id, asset.id, prismaPublic),
    listComments(ctx.family.id, asset.id, prismaPublic),
    prismaPublic.assetLike.findFirst({
      where: { assetId: asset.id, userId: ctx.user.id, familyId: ctx.family.id },
    }),
    prismaPublic.assetBookmark.findFirst({
      where: { assetId: asset.id, userId: ctx.user.id, familyId: ctx.family.id },
    }),
    prismaMedia.assetBaby.findMany({
      where: { assetId: asset.id },
      select: { babyId: true },
    }),
    prismaPublic.membership.findMany({
      where: { familyId: ctx.family.id, deletedAt: null },
      include: { user: { select: { id: true, displayName: true } } },
    }),
    listTagsForAsset({ assetId: asset.id, familyId: ctx.family.id }, prismaPublic),
    getSetting('download.compress.enabled', z.boolean(), true, prismaPublic),
  ])

  const babyIds = assetBabyLinks.map((link) => link.babyId)
  const babyRows = babyIds.length
    ? await prismaPublic.baby.findMany({
        where: { id: { in: babyIds }, familyId: ctx.family.id },
        select: { id: true, name: true },
      })
    : []

  const familyMembers = members.map((m) => ({ id: m.user.id, displayName: m.user.displayName }))
  const babies = babyRows.map((b) => ({ id: b.id, name: b.name }))

  // Use effective capabilities (built by resolveContext via family-capabilities
  // settings). `asset.delete.own` is a grantable family capability, so static
  // `can(role, …)` would hide the delete button from a family member the admin
  // has granted that capability to.
  const caps = ctx.capabilities
  const canDeleteAny = caps.includes('social.comment.delete.any')
  const canDelete =
    caps.includes('asset.delete.any') ||
    (asset.uploadedByUserId === ctx.user.id && caps.includes('asset.delete.own'))

  const initialComments = commentsRaw.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  }))

  return (
    <ViewerShell
      initialCurrent={bundle.current}
      initialSiblings={{
        prevId: bundle.prevId,
        nextId: bundle.nextId,
        prev: bundle.prev,
        next: bundle.next,
      }}
      currentUserId={ctx.user.id}
      canDeleteAny={canDeleteAny}
      canDelete={canDelete}
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
      initialTags={initialTags}
      initialFilename={asset.originalFilename}
      initialCaption={asset.caption}
      compressEnabled={compressEnabled}
    />
  )
}
