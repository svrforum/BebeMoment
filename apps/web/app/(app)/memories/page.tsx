import { MemoriesSections } from '@/components/memories/memories-sections'
import { AppHeader } from '@/components/shell/app-header'
import { EmptyState } from '@/components/ui/empty-state'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { listMemories } from '@/server/memories/list'
import { Sparkles } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

export default async function MemoriesPage() {
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')
  const t = await getTranslations('memories')

  const groups = await listMemories(
    {
      familyId: ctx.family.id,
      today: new Date(),
      viewerRole: ctx.membership?.role ?? 'family',
    },
    prismaMedia,
    prismaPublic,
    getMediaClient(),
  )

  return (
    <>
      <AppHeader title={t('title')} subtitle={t('subtitle')} wide />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 lg:max-w-5xl xl:max-w-6xl">
        {groups.length === 0 ? (
          <EmptyState icon={Sparkles} title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <MemoriesSections groups={groups} />
        )}
      </div>
    </>
  )
}
