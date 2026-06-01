import { ViewerShell } from '@/components/detail/viewer-shell'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { loadViewerBundle } from '@/server/asset/viewer-bundle'
import { listComments } from '@/server/comment/list'
import { getContext } from '@/server/context'
import { likersForAsset } from '@/server/like/list-for-asset'
import { getSetting } from '@/server/settings/get'
import { notFound } from 'next/navigation'
import { z } from 'zod'

export default async function DetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const { id } = await params
  const { sort: sortParam } = await searchParams
  const sort = sortParam === 'uploaded' ? 'uploaded' : 'taken'
  // getContext() is `cache()`-wrapped so layout + page share one fetch.
  // resolveContext() called directly would duplicate the user/membership
  // queries on every detail navigation.
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) return null

  const media = getMediaClient()
  // loadViewerBundle = current asset + adjacent prev/next slims (shared with
  // /api/asset/[id]/viewer-bundle so client-side swipe gets identical shape).
  // sort 는 타임라인의 정렬 모드와 일치시켜 prev/next 이웃이 그리드와 어긋나지 않게.
  const bundle = await loadViewerBundle(
    { assetId: id, familyId: ctx.family.id, sort },
    prismaMedia,
    media,
  )
  if (!bundle) notFound()

  // For metadata / babies we still need the full asset row — fetch directly.
  // `id` may be the publicNo (page URL); bundle.current.id is the resolved UUID.
  const asset = await prismaMedia.asset.findFirst({
    where: { id: bundle.current.id, familyId: ctx.family.id, deletedAt: null },
  })
  if (!asset) notFound()

  const [likers, commentsRaw, myLike, myBookmark, assetBabyLinks, members] = await Promise.all([
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

  // 앨범에 추가 노출 = 앨범 생성 권한 + 앨범 메뉴 미숨김(타임라인과 동일 기준).
  // 숨겨진 가족에겐 앨범 버튼 대신 다운로드 버튼을 그 자리에 보인다.
  const role = ctx.membership?.role ?? 'family'
  const isManager = role === 'owner' || role === 'guardian'
  const navHidden = isManager
    ? []
    : await getSetting('nav.family.hidden', z.array(z.string()), [], prismaPublic)
  const canAlbum = caps.includes('album.create') && !navHidden.includes('albums')

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
      canAlbum={canAlbum}
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
      initialFilename={asset.originalFilename}
      initialCaption={asset.caption}
      sort={sort}
    />
  )
}
