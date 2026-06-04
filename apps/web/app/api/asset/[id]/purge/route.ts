import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { purgeAsset } from '@/server/asset/purge'
import { resolveContext } from '@/server/context'
import { resolveCan } from '@bebe/core'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user || !ctx.membership) {
    return errorJsonKey('noFamily', 400)
  }

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!resolveCan(ctx.membership.role, 'asset.delete.any', familyCaps)) {
    return errorJsonKey('asset.purgeDenied', 403)
  }

  try {
    const { id } = await params
    await purgeAsset(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
