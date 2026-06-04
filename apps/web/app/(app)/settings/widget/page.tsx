import { WidgetSourceForm } from '@/components/settings/widget-source-form'
import { AppHeader } from '@/components/shell/app-header'
import { pickThumbUrl } from '@/lib/asset-url'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { getContext } from '@/server/context'
import { getWidgetConfig } from '@/server/widget/config'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function WidgetSettingsPage() {
  const ctx = await getContext()
  if (!ctx.user || !ctx.family) return null

  const [config, bookmarksPage] = await Promise.all([
    getWidgetConfig(ctx.user.id, prismaPublic),
    listMyBookmarks(
      ctx.family.id,
      ctx.user.id,
      { limit: 60 },
      prismaPublic,
      prismaMedia,
      getMediaClient(),
    ),
  ])

  const bookmarks = bookmarksPage.items
    .map((b) => ({ id: b.assetId, thumb: b.asset ? pickThumbUrl(b.asset.urls) : null }))
    .filter((b): b is { id: string; thumb: string } => Boolean(b.thumb))

  return (
    <>
      <AppHeader
        title="홈 위젯"
        left={
          <Link
            href="/settings"
            aria-label="설정으로"
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
          </Link>
        }
      />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4">
        <p className="mb-4 px-1 text-[13px] text-base-500">
          홈 화면 위젯에 어떤 사진을 보여줄지 고르세요.
        </p>
        <WidgetSourceForm
          initialSource={config.source}
          initialPinned={config.pinnedAssetId}
          bookmarks={bookmarks}
        />
      </div>
    </>
  )
}
