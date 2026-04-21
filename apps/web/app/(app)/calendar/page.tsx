import { MonthGrid } from '@/components/calendar/month-grid'
import { AppHeader } from '@/components/shell/app-header'
import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { listAssets } from '@/server/asset/list'
import { resolveContext } from '@/server/context'

export default async function CalendarPage() {
  const { session } = await getAuth()
  if (!session) return null
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) return null

  const assets = await listAssets({ familyId: ctx.family.id, limit: 500 }, prisma)

  const now = new Date()

  return (
    <>
      <AppHeader title="캘린더" />
      <MonthGrid
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth()}
        assets={assets.map((a) => {
          const derivs = (a.derivatives as Record<string, string> | null) ?? {}
          return {
            id: a.id,
            takenAtISO: a.takenAt.toISOString(),
            thumbKey: derivs.thumb_sm ?? derivs.poster,
          }
        })}
      />
    </>
  )
}
