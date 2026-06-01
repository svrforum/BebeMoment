import { PersonGrid } from '@/components/people/person-grid'
import { AppHeader } from '@/components/shell/app-header'
import { EmptyState } from '@/components/ui/empty-state'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { listPeople } from '@/server/people/list'
import { getFeatureFlags } from '@/server/settings/features'
import { UsersRound } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'

export default async function PeoplePage() {
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')
  const features = await getFeatureFlags(prismaPublic)
  if (!features.faces) notFound()

  const people = await listPeople({ familyId: ctx.family.id }, prismaMedia, getMediaClient())

  return (
    <>
      <AppHeader title="사람" subtitle="얼굴로 모은 사람들" wide />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4 lg:max-w-5xl">
        {people.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="아직 인식된 사람이 없어요"
            description="새 사진을 올리면 얼굴을 인식해 사람별로 모아드려요. 처리에는 잠시 시간이 걸릴 수 있어요."
          />
        ) : (
          <PersonGrid people={people} />
        )}
      </div>
    </>
  )
}
