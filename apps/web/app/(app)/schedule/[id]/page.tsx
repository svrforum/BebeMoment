import { EntryDetail } from '@/components/schedule/entry-detail'
import { prismaPublic } from '@/lib/db-init'
import { getContext } from '@/server/context'
import { getScheduleEntry } from '@/server/schedule/list'
import { getFeatureFlags } from '@/server/settings/features'
import { notFound } from 'next/navigation'

// 푸시 딥링크가 오는 주소다(`/schedule/<uuid>`). 모양이 아니면 Prisma 까지 보내지 않는다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext()
  if (!ctx.family || !ctx.user) notFound()
  const features = await getFeatureFlags(prismaPublic)
  if (!features.schedule || !ctx.capabilities.includes('schedule.read')) notFound()

  const { id } = await params
  if (!UUID.test(id)) notFound()
  const entry = await getScheduleEntry({ id, familyId: ctx.family.id }, prismaPublic)
  if (!entry) notFound()

  // 본인 것이면 .own, 남의 것이면 .any 가 있어야 고치거나 지운다(서버가 최종 방어).
  const own = entry.createdByUserId === ctx.user.id
  const canEdit = ctx.capabilities.includes(own ? 'schedule.edit.own' : 'schedule.edit.any')
  const canDelete = ctx.capabilities.includes(own ? 'schedule.delete.own' : 'schedule.delete.any')

  return <EntryDetail entry={entry} canEdit={canEdit} canDelete={canDelete} />
}
