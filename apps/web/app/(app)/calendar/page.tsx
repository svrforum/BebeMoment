import { MonthGrid } from '@/components/calendar/month-grid'
import { PullToRefresh } from '@/components/timeline/pull-to-refresh'
import { AppHeader } from '@/components/shell/app-header'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
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

  // 모델 B — 그 날 사진 중 (보이는) 스토리에 속한 게 있으면 해당 날짜 셀에 스토리
  // 뱃지. StoryAsset 은 cross-schema 라 assetId in 으로 멤버십만 끌어와 가시성 필터.
  const dayKeyOf = (d: Date): string => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
  const viewerRole = ctx.membership?.role ?? 'family'
  const storyDayKeys = new Set<string>()
  const allIds = rawAssets.map((a) => a.id)
  if (allIds.length) {
    const links = await prismaPublic.storyAsset.findMany({
      where: { assetId: { in: allIds } },
      select: { entryId: true, assetId: true },
    })
    if (links.length) {
      const entryIds = Array.from(new Set(links.map((l) => l.entryId)))
      const visible = await prismaPublic.story.findMany({
        where: {
          id: { in: entryIds },
          familyId: ctx.family.id,
          deletedAt: null,
          ...(viewerRole === 'family' ? { visibility: 'family' } : {}),
        },
        select: { id: true },
      })
      const visibleIds = new Set(visible.map((s) => s.id))
      const takenById = new Map(rawAssets.map((a) => [a.id, a.takenAt]))
      for (const l of links) {
        if (!visibleIds.has(l.entryId)) continue
        const d = takenById.get(l.assetId)
        if (d) storyDayKeys.add(dayKeyOf(d))
      }
    }
  }

  const now = new Date()

  return (
    <>
      <PullToRefresh />
      <AppHeader title="캘린더" />
      <div className="section-enter">
        <MonthGrid
          initialYear={now.getUTCFullYear()}
          initialMonth={now.getUTCMonth()}
          storyDays={Array.from(storyDayKeys)}
          assets={rawAssets.map((a) => ({
            id: a.id,
            takenAtISO: a.takenAt.toISOString(),
            urls: urlsMap[a.id] ?? null,
          }))}
        />
      </div>
    </>
  )
}
