import { milestonePresetLabels } from '@/i18n/labels'
import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { searchAll } from '@/server/search/query'
import { isFeatureEnabled } from '@/server/settings/features'
import type { Role } from '@bebe/core'
import { getTranslations } from 'next-intl/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx

  const query = new URL(req.url).searchParams.get('q') ?? ''
  const facesEnabled = await isFeatureEnabled('faces', prismaPublic)
  const presetLabels = milestonePresetLabels(await getTranslations('misc'))
  const results = await searchAll(
    {
      familyId: ctx.family.id,
      viewerRole: ctx.membership.role as Role,
      query,
      facesEnabled,
      presetLabels,
    },
    prismaPublic,
    prismaMedia,
  )
  return NextResponse.json(results)
}
