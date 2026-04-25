import { MonthGrid } from '@/components/calendar/month-grid'
import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listAssets } from '@/server/asset/list'
import { getContext } from '@/server/context'

export default async function CalendarPage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  const assets = await listAssets(
    { familyId: ctx.family.id, limit: 500 },
    prismaMedia,
    getMediaClient(),
  )

  const now = new Date()

  return (
    <>
      <AppHeader title="캘린더" />
      <MonthGrid
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth()}
        assets={assets.map((a) => ({
          id: a.id,
          takenAtISO: a.takenAt.toISOString(),
          urls: a.urls,
        }))}
      />
    </>
  )
}
