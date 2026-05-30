import { MemoriesSections } from '@/components/memories/memories-sections'
import { AppHeader } from '@/components/shell/app-header'
import { EmptyState } from '@/components/ui/empty-state'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { listMemories } from '@/server/memories/list'
import { Sparkles } from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function MemoriesPage() {
  const ctx = await getContext()
  if (!ctx.family) redirect('/onboarding')

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
      <AppHeader title="추억" subtitle="오늘과 같은 날의 지난 순간들" />
      <div className="section-enter mx-auto max-w-3xl px-5 py-4">
        {groups.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="오늘은 추억이 없어요"
            description="시간이 쌓이면 '몇 달 전 오늘', '작년 오늘'의 사진과 스토리를 여기서 다시 만나요"
          />
        ) : (
          <MemoriesSections groups={groups} />
        )}
      </div>
    </>
  )
}
