import { AlbumCard } from '@/components/albums/album-card'
import { AlbumCreateButton } from '@/components/albums/album-create-button'
import { AppHeader } from '@/components/shell/app-header'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { EmptyState } from '@/components/ui/empty-state'
import { SearchBox } from '@/components/ui/search-box'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listAlbums } from '@/server/album/list'
import { previewAttachmentsByAlbum } from '@/server/album/preview-attachments'
import { searchAlbums } from '@/server/album/search'
import { getContext } from '@/server/context'
import { getFeatureFlags } from '@/server/settings/features'
import { Bookmark, FolderHeart, FolderPlus, Search, UsersRound } from 'lucide-react'
import Link from 'next/link'

const PREVIEW_PER_ALBUM = 4

export default async function AlbumsRootPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const ctx = await getContext()
  if (!ctx.family) return null

  const canCreate = ctx.capabilities.includes('album.create')
  const viewerRole = ctx.membership?.role ?? 'family'
  // 관리자(owner/guardian)는 북마크 전용 하단탭이 없어서 앨범 탭 헤더에서 북마크로 진입.
  const features = await getFeatureFlags(prismaPublic)
  const { q } = await searchParams
  const query = typeof q === 'string' && q.trim() ? q.trim() : undefined

  const albums = query
    ? await searchAlbums({ familyId: ctx.family.id, q: query, viewerRole }, prismaPublic)
    : await listAlbums({ familyId: ctx.family.id, parentId: null, viewerRole }, prismaPublic)

  // Up to N most-recent attachments per album in a single window-function
  // query — replaces the "fetch all rows, slice in JS" pattern which
  // scaled with total photos in albums.
  const previewByAlbum = await previewAttachmentsByAlbum(
    {
      familyId: ctx.family.id,
      albumIds: albums.map((a) => a.id),
      perAlbum: PREVIEW_PER_ALBUM,
    },
    prismaPublic,
  )

  const allPreviewIds = Array.from(new Set(Array.from(previewByAlbum.values()).flat()))
  const readyAssets = allPreviewIds.length
    ? await prismaMedia.asset.findMany({
        where: {
          id: { in: allPreviewIds },
          familyId: ctx.family.id,
          status: 'ready',
          deletedAt: null,
        },
        select: { id: true },
      })
    : []
  const readyIds = readyAssets.map((a) => a.id)
  const urlsMap = readyIds.length
    ? await getMediaClient().getAssetUrlsBatch(ctx.family.id, readyIds)
    : {}

  return (
    <>
      <PullToRefresh />
      <AppHeader
        title="앨범"
        right={
          <div className="flex items-center gap-1">
            {features.faces && (
              <Link
                href="/people"
                aria-label="사람"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition-colors hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
              >
                <UsersRound size={19} strokeWidth={2.1} />
              </Link>
            )}
            {features.bookmarks && (
              <Link
                href="/saved"
                aria-label="북마크"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition-colors hover:bg-base-100 active:scale-95 dark:text-base-300 dark:hover:bg-base-800"
              >
                <Bookmark size={19} strokeWidth={2.1} />
              </Link>
            )}
            {canCreate && <AlbumCreateButton />}
          </div>
        }
        wide
      />
      <div className="mx-auto max-w-3xl lg:max-w-5xl xl:max-w-6xl px-5 py-4">
        <div className="mb-5">
          <SearchBox placeholder="앨범 이름 검색" />
        </div>

        {albums.length === 0 ? (
          query ? (
            <EmptyState icon={Search} title="검색 결과가 없어요" description={`"${query}"`} />
          ) : canCreate ? (
            <EmptyState
              icon={FolderPlus}
              title="첫 앨범을 만들어보세요"
              description={'"2026 → 여행" 처럼 폴더로 묶어서 정리할 수 있어요'}
              action={<AlbumCreateButton />}
            />
          ) : (
            <EmptyState
              icon={FolderHeart}
              title="아직 앨범이 없어요"
              description="관리자가 사진을 모아 앨범으로 만들면 여기에 보여요"
            />
          )
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {albums.map((a) => {
              const previewIds = previewByAlbum.get(a.id) ?? []
              // ready + URL 있는 자산만 미리보기에 — 그 외엔 폴더 아이콘 폴백
              const preview = previewIds
                .map((id) => ({ id, urls: urlsMap[id] ?? null }))
                .filter(
                  (p): p is { id: string; urls: NonNullable<typeof p.urls> } => p.urls !== null,
                )
              return (
                <AlbumCard
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  childCount={a.childCount}
                  assetCount={a.assetCount}
                  preview={preview}
                  secret={a.secret}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
