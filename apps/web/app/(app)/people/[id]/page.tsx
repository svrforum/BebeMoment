import { PersonNameEditor } from '@/components/people/person-name-editor'
import { AppHeader } from '@/components/shell/app-header'
import { AssetCard } from '@/components/timeline/asset-card'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { EmptyState } from '@/components/ui/empty-state'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { getPersonAssets } from '@/server/people/list'
import { getFeatureFlags } from '@/server/settings/features'
import { ChevronLeft, ImageOff } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

export default async function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')
  const features = await getFeatureFlags(prismaPublic)
  if (!features.faces) notFound()

  const { id } = await params
  const { person, assets, truncated } = await getPersonAssets(
    { familyId: ctx.family.id, personId: id },
    prismaMedia,
    getMediaClient(),
  )
  if (!person) notFound()

  return (
    <>
      <PullToRefresh />
      <AppHeader
        title={person.name ?? '이름 없음'}
        subtitle={truncated ? `먼저 ${assets.length}장 표시 중` : `사진 ${assets.length}장`}
        wide
        left={
          <Link
            href="/people"
            aria-label="사람 목록"
            className="flex h-9 w-9 items-center justify-center rounded-full text-base-600 active:bg-base-100 dark:text-base-300 dark:active:bg-base-800"
          >
            <ChevronLeft size={22} />
          </Link>
        }
        right={
          ctx.capabilities.includes('person.rename') ? (
            <PersonNameEditor personId={person.id} initialName={person.name} />
          ) : undefined
        }
      />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 lg:max-w-5xl xl:max-w-6xl">
        {assets.length === 0 ? (
          <EmptyState
            icon={ImageOff}
            title="사진이 없어요"
            description="이 사람의 사진이 아직 없어요."
          />
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {assets.map((a) => (
              <AssetCard
                key={a.id}
                id={a.id}
                publicNo={a.publicNo}
                urls={a.urls}
                status={a.status as 'uploading' | 'processing' | 'ready' | 'failed'}
                kind={a.kind as 'image' | 'video'}
                durationMs={a.durationMs}
                viewerCtx={`person:${person.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
