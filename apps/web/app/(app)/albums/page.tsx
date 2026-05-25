import { AlbumCard } from '@/components/albums/album-card'
import { AlbumCreateButton } from '@/components/albums/album-create-button'
import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listAlbums } from '@/server/album/list'
import { previewAttachmentsByAlbum } from '@/server/album/preview-attachments'
import { getContext } from '@/server/context'
import { FolderPlus } from 'lucide-react'

const PREVIEW_PER_ALBUM = 4

export default async function AlbumsRootPage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  const albums = await listAlbums({ familyId: ctx.family.id, parentId: null }, prismaPublic)

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
      <AppHeader title="앨범" right={<AlbumCreateButton />} />
      <div className="mx-auto max-w-3xl px-5 py-4">
        {albums.length === 0 ? (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-16 text-center">
            <div className="rounded-full bg-base-100 p-6 dark:bg-base-800">
              <FolderPlus className="h-10 w-10 text-base-400" strokeWidth={1.6} />
            </div>
            <div>
              <p className="text-base font-semibold text-base-900 dark:text-base-50">
                첫 앨범을 만들어보세요
              </p>
              <p className="mt-1 text-sm text-base-500">
                "2026 → 여행" 처럼 폴더로 묶어서 정리할 수 있어요
              </p>
            </div>
            <AlbumCreateButton />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {albums.map((a) => {
              const previewIds = previewByAlbum.get(a.id) ?? []
              const preview = previewIds.map((id) => ({
                id,
                urls: urlsMap[id] ?? null,
              }))
              return (
                <AlbumCard
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  childCount={a.childCount}
                  assetCount={a.assetCount}
                  preview={preview}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
