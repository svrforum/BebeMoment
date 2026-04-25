import { MonthGrid } from '@/components/calendar/month-grid'
import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getContext } from '@/server/context'

export default async function CalendarPage() {
  const ctx = await getContext()
  if (!ctx.family) return null

  // Calendar only needs one cover thumb per day. Pull metadata for ALL ready
  // assets but only sign URLs for the per-day cover (first taken per day) —
  // this used to fan out 500 signed URLs to media on every page hit.
  const rawAssets = await prismaMedia.asset.findMany({
    where: { familyId: ctx.family.id, status: 'ready', deletedAt: null },
    orderBy: { takenAt: 'desc' },
    take: 500,
    select: {
      id: true,
      takenAt: true,
      familyId: true,
    },
  })

  const seenDates = new Set<string>()
  const coverIds: string[] = []
  for (const a of rawAssets) {
    const d = a.takenAt
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    if (seenDates.has(key)) continue
    seenDates.add(key)
    coverIds.push(a.id)
  }

  const urlsMap = coverIds.length
    ? await getMediaClient().getAssetUrlsBatch(ctx.family.id, coverIds)
    : {}

  const now = new Date()

  return (
    <>
      <AppHeader title="캘린더" />
      <MonthGrid
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth()}
        assets={rawAssets.map((a) => ({
          id: a.id,
          takenAtISO: a.takenAt.toISOString(),
          urls: urlsMap[a.id] ?? null,
        }))}
      />
    </>
  )
}
