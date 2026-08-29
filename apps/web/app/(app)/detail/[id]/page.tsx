import { ViewerShell } from '@/components/detail/viewer-shell'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { loadViewerBundle } from '@/server/asset/viewer-bundle'
import { loadViewerDetail } from '@/server/asset/viewer-detail'
import { resolveNeighborIds } from '@/server/asset/viewer-neighbors'
import { resolveStoryViewerCtx } from '@/server/asset/viewer-story-ctx'
import { listComments } from '@/server/comment/list'
import { getContext } from '@/server/context'
import { getSetting } from '@/server/settings/get'
import { notFound } from 'next/navigation'
import { z } from 'zod'

export default async function DetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sort?: string; ctx?: string }>
}) {
  const { id } = await params
  const { sort: sortParam, ctx: ctxParam } = await searchParams
  const sort = sortParam === 'uploaded' ? 'uploaded' : 'taken'
  // getContext() is `cache()`-wrapped so layout + page share one fetch.
  // resolveContext() called directly would duplicate the user/membership
  // queries on every detail navigation.
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) return null

  const media = getMediaClient()
  // 컬렉션(추억·앨범·북마크·스토리·사람)에서 열렸으면 그 컬렉션 순서로 prev/next 를 돈다.
  const neighborIds = await resolveNeighborIds(
    ctxParam,
    { familyId: ctx.family.id, userId: ctx.user.id, viewerRole: ctx.membership?.role ?? 'family' },
    prismaPublic,
    prismaMedia,
    media,
  )
  // loadViewerBundle = current asset + adjacent prev/next slims (shared with
  // /api/asset/[id]/viewer-bundle so client-side swipe gets identical shape).
  // sort 는 타임라인의 정렬 모드와 일치시켜 prev/next 이웃이 그리드와 어긋나지 않게.
  const bundle = await loadViewerBundle(
    {
      assetId: id,
      familyId: ctx.family.id,
      sort,
      viewerRole: ctx.membership?.role ?? 'family',
      ...(neighborIds ? { neighborIds } : {}),
    },
    prismaMedia,
    media,
    prismaPublic,
  )
  if (!bundle) notFound()

  // 자산 행 + 내 반응 상태 + 아기는 스와이프 API 와 같은 서비스로 조립한다.
  // `id` 는 publicNo 일 수 있고, bundle.current.id 가 해석된 UUID 다.
  const detail = await loadViewerDetail(
    { assetId: bundle.current.id, familyId: ctx.family.id, userId: ctx.user.id },
    prismaPublic,
    prismaMedia,
  )
  if (!detail) notFound()
  const asset = detail.asset

  const [commentsRaw, members] = await Promise.all([
    listComments(ctx.family.id, asset.id, prismaPublic),
    prismaPublic.membership.findMany({
      where: { familyId: ctx.family.id, deletedAt: null },
      include: { user: { select: { id: true, displayName: true } } },
    }),
  ])

  const likers = detail.likers
  const myLike = detail.liked
  const myBookmark = detail.bookmarked
  const myWidgetPhoto = detail.inWidget
  const familyMembers = members.map((m) => ({ id: m.user.id, displayName: m.user.displayName }))
  const babies = detail.babies

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

  const storyCtx = await resolveStoryViewerCtx(
    ctxParam,
    neighborIds,
    bundle.current.id,
    ctx.family.id,
    prismaPublic,
    role,
  )

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
      initialInWidget={!!myWidgetPhoto}
      initialComments={initialComments}
      initialFilename={asset.originalFilename}
      initialCaption={asset.caption}
      initialStoryCtx={storyCtx}
      sort={sort}
      viewerCtx={ctxParam ?? null}
    />
  )
}
