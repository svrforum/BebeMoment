import { InfoPanel } from '@/components/detail/info-panel'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { getAssetForFamily } from '@/server/asset/get'
import { resolveContext } from '@/server/context'
import { notFound } from 'next/navigation'
import { DetailViewer } from './detail-viewer'

export default async function DetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session } = await getAuth()
  if (!session) return null
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) return null

  const asset = await getAssetForFamily({ assetId: id, familyId: ctx.family.id }, prisma)
  if (!asset) notFound()

  const derivs = (asset.derivatives as Record<string, string> | null) ?? {}
  const mediaUrl =
    asset.kind === 'video'
      ? `/media/${derivs.preview_video ?? asset.originalKey}`
      : `/media/${derivs.thumb_lg ?? asset.originalKey}`
  const posterUrl = derivs.poster ? `/media/${derivs.poster}` : undefined

  const prevAsset = await prisma.asset.findFirst({
    where: {
      familyId: ctx.family.id,
      deletedAt: null,
      OR: [{ takenAt: { gt: asset.takenAt } }, { takenAt: asset.takenAt, id: { gt: asset.id } }],
    },
    orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
  })
  const nextAsset = await prisma.asset.findFirst({
    where: {
      familyId: ctx.family.id,
      deletedAt: null,
      OR: [{ takenAt: { lt: asset.takenAt } }, { takenAt: asset.takenAt, id: { lt: asset.id } }],
    },
    orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
  })

  return (
    <>
      <DetailViewer
        current={{ id: asset.id, kind: asset.kind, mediaUrl, posterUrl }}
        siblings={{ prevId: prevAsset?.id, nextId: nextAsset?.id }}
        originalFilename={asset.originalFilename}
      />
      <div className="bg-base-50 dark:bg-base-950 px-5 py-6">
        <InfoPanel
          status={asset.status}
          sizeBytes={asset.sizeBytes}
          width={asset.width}
          height={asset.height}
          takenAt={asset.takenAt}
          takenAtSource={asset.takenAtSource}
          cameraMake={asset.cameraMake}
          cameraModel={asset.cameraModel}
        />
      </div>
    </>
  )
}
