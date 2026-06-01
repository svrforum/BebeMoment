import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { loadCalendarMonth } from '@/server/calendar/month'
import { resolveContext } from '@/server/context'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return NextResponse.json({ error: 'No family' }, { status: 400 })

  const sp = new URL(req.url).searchParams
  const year = Number(sp.get('year'))
  const month = Number(sp.get('month')) // UTC 0-based
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
    return NextResponse.json({ error: '잘못된 연·월' }, { status: 400 })
  }

  const data = await loadCalendarMonth(
    { familyId: ctx.family.id, year, month, viewerRole: ctx.membership?.role ?? 'family' },
    prismaMedia,
    prismaPublic,
    getMediaClient(),
  )
  return NextResponse.json(data)
}
