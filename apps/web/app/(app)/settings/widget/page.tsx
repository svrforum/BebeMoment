import { WidgetSourceForm } from '@/components/settings/widget-source-form'
import { AppHeader } from '@/components/shell/app-header'
import { pickThumbUrl } from '@/lib/asset-url'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveAssetUrlsForViewer } from '@/server/asset/urls-for-viewer'
import { getContext } from '@/server/context'
import { listWidgetPhotos } from '@/server/widget/collection'
import { getWidgetConfig } from '@/server/widget/config'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function WidgetSettingsPage() {
  const t = await getTranslations('settings')
  const ctx = await getContext()
  if (!ctx.user || !ctx.family) return null

  const [config, collectionIds] = await Promise.all([
    getWidgetConfig(ctx.user.id, prismaPublic),
    listWidgetPhotos({ familyId: ctx.family.id, userId: ctx.user.id }, prismaPublic),
  ])

  // 담긴 뒤 삭제된 사진은 목록에서 조용히 빠진다(위젯 읽기 경로와 같은 규칙).
  const live = collectionIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: collectionIds }, familyId: ctx.family.id, deletedAt: null },
        select: { id: true },
      })
    : []
  const liveSet = new Set(live.map((a) => a.id))
  const orderedIds = collectionIds.filter((id) => liveSet.has(id))
  // 새 asset 노출 지점 — 비밀 스토리 사진을 family 역할에게 내주지 않게 반드시 이 헬퍼로
  // URL 을 받는다(§21). 담은 뒤에 비밀 스토리로 묶인 사진이 여기로 새던 경로였다.
  const urls = orderedIds.length
    ? await resolveAssetUrlsForViewer(
        {
          familyId: ctx.family.id,
          viewerRole: ctx.membership?.role ?? 'family',
          ids: orderedIds,
        },
        prismaPublic,
        getMediaClient(),
      )
    : {}
  const photos = orderedIds
    .map((id) => ({ id, thumb: pickThumbUrl(urls[id] ?? null) }))
    .filter((p): p is { id: string; thumb: string } => Boolean(p.thumb))

  return (
    <>
      <AppHeader
        title={t('widget.title')}
        left={
          <Link
            href="/settings"
            aria-label={t('widget.back')}
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-base-600 transition hover:bg-base-100 dark:text-base-300 dark:hover:bg-base-800"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
          </Link>
        }
      />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4">
        <p className="mb-4 px-1 text-[13px] text-base-500">{t('widget.intro')}</p>
        <WidgetSourceForm initialSource={config.source} photos={photos} />
      </div>
    </>
  )
}
