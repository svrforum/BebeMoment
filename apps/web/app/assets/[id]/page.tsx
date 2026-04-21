import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { getAssetForFamily } from '@/server/asset/get'
import { resolveContext } from '@/server/context'
import { notFound, redirect } from 'next/navigation'
import { AssetViewer } from './asset-viewer'

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) redirect('/onboarding')

  const asset = await getAssetForFamily({ assetId: id, familyId: ctx.family.id }, prisma)
  if (!asset) notFound()

  const derivs = (asset.derivatives as Record<string, string>) ?? {}
  const mediaUrl =
    asset.kind === 'video'
      ? `/media/${derivs.preview_video ?? asset.originalKey}`
      : `/media/${derivs.thumb_lg ?? asset.originalKey}`
  const posterUrl = derivs.poster ? `/media/${derivs.poster}` : undefined

  return (
    <main style={{ maxWidth: 900, margin: '24px auto', padding: 24 }}>
      <a href="/assets">← 목록</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>{asset.originalFilename}</h1>
      <div style={{ marginTop: 16 }}>
        <AssetViewer
          kind={asset.kind}
          mediaUrl={mediaUrl}
          posterUrl={posterUrl}
          originalFilename={asset.originalFilename}
        />
      </div>
      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>정보</h2>
        <dl style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '100px 1fr', gap: 4 }}>
          <dt>상태</dt>
          <dd>{asset.status}</dd>
          <dt>크기</dt>
          <dd>{Number(asset.sizeBytes).toLocaleString()} bytes</dd>
          {asset.width && (
            <>
              <dt>해상도</dt>
              <dd>
                {asset.width} × {asset.height}
              </dd>
            </>
          )}
          <dt>촬영일</dt>
          <dd>{asset.takenAt.toLocaleString('ko-KR')}</dd>
          <dt>소스</dt>
          <dd>{asset.takenAtSource}</dd>
          {asset.cameraMake && (
            <>
              <dt>카메라</dt>
              <dd>
                {asset.cameraMake} {asset.cameraModel}
              </dd>
            </>
          )}
        </dl>
      </section>
    </main>
  )
}
