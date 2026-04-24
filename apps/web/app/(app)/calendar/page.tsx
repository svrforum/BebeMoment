import { MonthGrid } from '@/components/calendar/month-grid'
import { AppHeader } from '@/components/shell/app-header'
import { prisma } from '@/lib/db-init'
import { listAssets } from '@/server/asset/list'
import { getContext } from '@/server/context'

export default async function CalendarPage() {
  const ctx = await getContext()
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
