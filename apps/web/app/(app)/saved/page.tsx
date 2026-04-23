import { AppHeader } from '@/components/shell/app-header'
import { AssetCard } from '@/components/timeline/asset-card'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { listMyBookmarks } from '@/server/bookmark/list-mine'
import { resolveContext } from '@/server/context'
import { redirect } from 'next/navigation'

export default async function SavedPage() {
  const { session } = await getAuth()
  if (!session) redirect('/login')
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family || !ctx.user) redirect('/onboarding')

  const { items } = await listMyBookmarks(ctx.family.id, ctx.user.id, { limit: 60 }, prisma)

  return (
    <>
      <AppHeader title="저장함" />
      <div className="mx-auto max-w-3xl px-5 py-4">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-base-500">저장한 사진이 없어요.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {items.map((b) => {
              const d = (b.asset.derivatives as Record<string, string> | null) ?? {}
              const thumb = d.thumb_sm ?? d.poster
              return (
                <AssetCard
                  key={b.assetId}
                  id={b.assetId}
                  thumbKey={thumb}
                  status={b.asset.status}
                  kind={b.asset.kind}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
