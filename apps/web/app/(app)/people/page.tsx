import { PersonGrid } from '@/components/people/person-grid'
import { AppHeader } from '@/components/shell/app-header'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { EmptyState } from '@/components/ui/empty-state'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { listPeople } from '@/server/people/list'
import { getFeatureFlags } from '@/server/settings/features'
import { UsersRound } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'

export default async function PeoplePage() {
  const t = await getTranslations('misc')
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')
  const features = await getFeatureFlags(prismaPublic)
  if (!features.faces) notFound()

  const people = await listPeople(
    { familyId: ctx.family.id, viewerRole: ctx.membership?.role ?? 'family' },
    prismaMedia,
    getMediaClient(),
    prismaPublic,
  )

  return (
    <>
      <PullToRefresh />
      <AppHeader title={t('people.title')} subtitle={t('people.subtitle')} wide />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 lg:max-w-5xl xl:max-w-6xl">
        {people.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={t('people.emptyTitle')}
            description={t('people.emptyDescription')}
          />
        ) : (
          <PersonGrid people={people} />
        )}
      </div>
    </>
  )
}
