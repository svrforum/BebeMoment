import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'
import { notFound } from 'next/navigation'
import { TrashList } from './trash-list'

export default async function TrashPage() {
  const ctx = await getContext()
  // 휴지통은 가족 전체의 삭제 자산(비밀 앨범 것 포함)을 보여주므로 삭제 관리 권한
  // (asset.delete.any = owner/guardian)이 있어야 한다. family 역할은 직접 진입해도 차단.
  // (설정의 휴지통 링크는 admin 게이트지만 라우트엔 가드가 없어 직접 URL 진입이 가능했다.)
  if (!ctx.family || !ctx.capabilities.includes('asset.delete.any')) notFound()

  const deleted = await prismaMedia.asset.findMany({
    where: { familyId: ctx.family.id, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    take: 100,
  })

  const readyIds = deleted.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length
    ? await getMediaClient().getAssetUrlsBatch(ctx.family.id, readyIds, { includeDeleted: true })
    : {}

  const canPurge = ctx.capabilities.includes('asset.delete.any')

  return (
    <>
      <AppHeader title="휴지통" />
      <TrashList
        canPurge={canPurge}
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
