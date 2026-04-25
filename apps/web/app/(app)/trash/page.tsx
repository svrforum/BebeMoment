import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { TrashList } from './trash-list'

export default async function TrashPage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  const deleted = await prismaMedia.asset.findMany({
    where: { familyId: ctx.family.id, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    take: 100,
  })

  const readyIds = deleted.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length
    ? await getMediaClient().getAssetUrlsBatch(ctx.family.id, readyIds)
    : {}

  return (
    <>
      <AppHeader title="휴지통" />
      <TrashList
        assets={deleted.map((a) => ({
          id: a.id,
          originalFilename: a.originalFilename,
          urls: urlsMap[a.id] ?? null,
          deletedAtISO: a.deletedAt?.toISOString() ?? '',
        }))}
      />
    </>
  )
}
