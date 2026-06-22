import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { searchAll } from '@/server/search/query'
import { isFeatureEnabled } from '@/server/settings/features'
import type { Role } from '@bebe/core'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.membership)
    return NextResponse.json({ error: 'No current family' }, { status: 400 })

  const query = new URL(req.url).searchParams.get('q') ?? ''
  const facesEnabled = await isFeatureEnabled('faces', prismaPublic)
  const results = await searchAll(
    { familyId: ctx.family.id, viewerRole: ctx.membership.role as Role, query, facesEnabled },
    prismaPublic,
    prismaMedia,
  )
  return NextResponse.json(results)
}
