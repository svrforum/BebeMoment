import { AppHeader } from '@/components/shell/app-header'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { TrashList } from './trash-list'

export default async function TrashPage() {
  const { session } = await getAuth()
  if (!session) return null
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) return null

  const deleted = await prisma.asset.findMany({
    where: { familyId: ctx.family.id, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    take: 100,
  })

  return (
    <>
      <AppHeader title="휴지통" />
      <TrashList
        assets={deleted.map((a) => {
          const derivs = (a.derivatives as Record<string, string> | null) ?? {}
          const thumbKey = derivs.thumb_sm ?? derivs.poster
          return {
            id: a.id,
            originalFilename: a.originalFilename,
            ...(thumbKey ? { thumbKey } : {}),
            deletedAtISO: a.deletedAt?.toISOString() ?? '',
          }
        })}
      />
    </>
  )
}
