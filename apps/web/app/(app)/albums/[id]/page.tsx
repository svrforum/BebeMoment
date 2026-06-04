import { AlbumBreadcrumbs } from '@/components/albums/album-breadcrumbs'
import { AlbumCard } from '@/components/albums/album-card'
import { AlbumCreateButton } from '@/components/albums/album-create-button'
import { AlbumMenu } from '@/components/albums/album-menu'
import { AlbumShareButton } from '@/components/albums/album-share-button'
import { AlbumStoryItem } from '@/components/albums/album-story-item'
import { AppHeader } from '@/components/shell/app-header'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { AssetCard } from '@/components/timeline/asset-card'
import { EmptyState } from '@/components/ui/empty-state'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getAlbumWithBreadcrumbs } from '@/server/album/get'
import { listAlbums } from '@/server/album/list'
import { listAlbumAssets } from '@/server/album/list-assets'
import { listAlbumEntries } from '@/server/album/list-entries'
import { previewAttachmentsByAlbum } from '@/server/album/preview-attachments'
import { getContext } from '@/server/context'
import { isFeatureEnabled } from '@/server/settings/features'
import { ImagePlus } from 'lucide-react'
import { notFound } from 'next/navigation'

const PREVIEW_PER_CHILD = 4

export default async function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await getContext()
  if (!ctx.family) return null

  const canCreate = ctx.capabilities.includes('album.create')
  const viewerRole = ctx.membership?.role ?? 'family'
  const canToggleSecret = viewerRole === 'owner' || viewerRole === 'guardian'

  const album = await getAlbumWithBreadcrumbs(
    { albumId: id, familyId: ctx.family.id, viewerRole },
    prismaPublic,
  )
  if (!album) notFound()

  // 비밀 앨범은 공유 불가(§21 — family 역할에게 숨김). 공유 기능 플래그도 게이트.
  const shareEnabled = !album.secret && (await isFeatureEnabled('share', prismaPublic))

  const [children, assetsResult, entries] = await Promise.all([
    listAlbums({ familyId: ctx.family.id, parentId: album.id, viewerRole }, prismaPublic),
    listAlbumAssets(
      { albumId: album.id, familyId: ctx.family.id },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
    listAlbumEntries(
      { albumId: album.id, familyId: ctx.family.id, viewerRole },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
  ])
  const assets = assetsResult.assets

  // Child album preview thumbs — up to N latest attachments per child album
  // in one window-function query (cheap regardless of family size).
  const previewByAlbum = await previewAttachmentsByAlbum(
    {
      familyId: ctx.family.id,
      albumIds: children.map((c) => c.id),
      perAlbum: PREVIEW_PER_CHILD,
    },
    prismaPublic,
  )
  const previewIds = Array.from(new Set(Array.from(previewByAlbum.values()).flat()))
  const readyChildAssets = previewIds.length
    ? await prismaMedia.asset.findMany({
        where: {
          id: { in: previewIds },
          familyId: ctx.family.id,
          status: 'ready',
          deletedAt: null,
        },
        select: { id: true },
      })
    : []
  const childUrlsMap = readyChildAssets.length
    ? await getMediaClient().getAssetUrlsBatch(
        ctx.family.id,
        readyChildAssets.map((a) => a.id),
      )
    : {}

  const trail = [...album.breadcrumbs]

  return (
    <>
      <PullToRefresh />
      <AppHeader
        title={album.name}
        right={
          <div className="flex items-center gap-2">
            {canCreate && <AlbumCreateButton parentId={album.id} parentName={album.name} />}
            {shareEnabled && <AlbumShareButton albumId={album.id} albumName={album.name} />}
            <AlbumMenu
              albumId={album.id}
              currentName={album.name}
              parentId={album.parentId}
              hasChildrenOrPhotos={album.childCount > 0 || album.assetCount > 0}
              secret={album.secret}
              canToggleSecret={canToggleSecret}
            />
          </div>
        }
      />
      <div className="mx-auto max-w-3xl px-5 py-3 lg:max-w-5xl xl:max-w-6xl">
        <AlbumBreadcrumbs trail={trail} />
        <p className="mt-2 text-[12px] tabular-nums text-base-400">
          {album.assetCount}장{entries.length > 0 && ` · 스토리 ${entries.length}개`} ·{' '}
          {album.childCount}개 하위 앨범
        </p>

        {children.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 px-1 text-[13px] font-semibold tracking-tight text-base-500">
              하위 앨범
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {children.map((c) => {
                const ids = previewByAlbum.get(c.id) ?? []
                // ready + URL 있는 자산만 — 그 외엔 폴더 아이콘 폴백
                const preview = ids
                  .map((aid) => ({ id: aid, urls: childUrlsMap[aid] ?? null }))
                  .filter(
                    (p): p is { id: string; urls: NonNullable<typeof p.urls> } => p.urls !== null,
                  )
                return (
                  <AlbumCard
                    key={c.id}
                    id={c.id}
                    name={c.name}
                    childCount={c.childCount}
                    assetCount={c.assetCount}
                    preview={preview}
                    secret={c.secret}
                  />
                )
              })}
            </div>
          </section>
        )}

        {entries.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 px-1 text-[13px] font-semibold tracking-tight text-base-500">
              스토리
            </h2>
            <div className="space-y-3">
              {entries.map((e) => (
                <AlbumStoryItem key={e.id} albumId={album.id} entry={e} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-3 px-1 text-[13px] font-semibold tracking-tight text-base-500">
            사진 · 영상
          </h2>
          {assets.length === 0 ? (
            <EmptyState
              icon={ImagePlus}
              title="아직 사진이 없어요"
              description={'사진을 보고 우상단 메뉴 → "앨범에 추가" 로 담아보세요'}
            />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {assets.map((a) => (
                  <AssetCard
                    key={a.id}
                    id={a.id}
                    publicNo={a.publicNo}
                    urls={a.urls}
                    status={a.status as 'uploading' | 'processing' | 'ready' | 'failed'}
                    kind={a.kind as 'image' | 'video'}
                    viewerCtx={`album:${album.id}`}
                  />
                ))}
              </div>
              {assetsResult.truncated && (
                <p className="mt-3 px-1 text-[12px] text-base-500">
                  먼저 {assets.length}장 표시 중 · 전체 {assetsResult.total}장
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
