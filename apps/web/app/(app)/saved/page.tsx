import { AppHeader } from '@/components/shell/app-header'
import { AssetCard } from '@/components/timeline/asset-card'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { getContext } from '@/server/context'
import { Bookmark } from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function SavedPage() {
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) redirect('/onboarding')

  const { items } = await listMyBookmarks(
    ctx.family.id,
    ctx.user.id,
    { limit: 60 },
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )

  return (
    <>
      <AppHeader title="저장함" />
      <div className="mx-auto max-w-3xl px-5 py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="rounded-full bg-base-100 p-6 dark:bg-base-800">
              <Bookmark className="h-10 w-10 text-base-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-base-900 dark:text-base-50">
                저장한 사진이 없어요
              </p>
              <p className="mt-1 text-sm text-base-500">
                사진 옆 북마크 아이콘을 누르면 여기에 모여요
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {items.map((b) => {
              if (!b.asset) return null
              return (
                <AssetCard
                  key={b.assetId}
                  id={b.assetId}
                  urls={b.asset.urls}
                  status={b.asset.status}
                  kind={b.asset.kind}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
