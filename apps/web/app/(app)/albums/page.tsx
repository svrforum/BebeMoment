import { AlbumCard } from '@/components/albums/album-card'
import { AlbumCreateButton } from '@/components/albums/album-create-button'
import { AppHeader } from '@/components/shell/app-header'
import { EmptyState } from '@/components/ui/empty-state'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listAlbums } from '@/server/album/list'
import { previewAttachmentsByAlbum } from '@/server/album/preview-attachments'
import { getContext } from '@/server/context'
import { listTagsWithCounts } from '@/server/tag/list'
import { Bookmark, FolderPlus, Tag as TagIcon } from 'lucide-react'
import Link from 'next/link'

const PREVIEW_PER_ALBUM = 4

export default async function AlbumsRootPage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  const canCreate = ctx.capabilities.includes('album.create')

  const [albums, tags] = await Promise.all([
    listAlbums(
      { familyId: ctx.family.id, parentId: null, viewerRole: ctx.membership?.role ?? 'family' },
      prismaPublic,
    ),
    listTagsWithCounts(ctx.family.id, prismaPublic),
  ])

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
      <AppHeader title="앨범" right={canCreate ? <AlbumCreateButton /> : null} wide />
      <div className="mx-auto max-w-3xl lg:max-w-5xl px-5 py-4">
        {/* 스마트 컬렉션: 저장됨(내 북마크) + 태그별 보기 */}
        <div className="mb-6 space-y-3">
          <Link
            href="/saved"
            className="flex items-center gap-3 rounded-2xl border border-base-200 bg-base-0 px-4 py-3 transition active:scale-[0.99] dark:border-base-800 dark:bg-base-900"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-point-500/12 text-point-500">
              <Bookmark size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-base-900 dark:text-base-50">저장됨</div>
              <div className="text-xs text-base-500">내가 북마크한 사진</div>
            </div>
          </Link>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link
                  key={t.id}
                  href={`/timeline?tag=${t.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-base-200 px-3 py-1.5 text-[13px] text-base-700 transition hover:bg-base-100 dark:border-base-800 dark:text-base-300 dark:hover:bg-base-800"
                >
                  <TagIcon size={12} className="text-base-400" />
                  {t.name}
                  <span className="tabular-nums text-base-400">{t.assetCount}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        {albums.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="첫 앨범을 만들어보세요"
            description={'"2026 → 여행" 처럼 폴더로 묶어서 정리할 수 있어요'}
            {...(canCreate ? { action: <AlbumCreateButton /> } : {})}
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
