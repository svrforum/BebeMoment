import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { restoreAsset } from '@/server/asset/restore'
import { resolveContext } from '@/server/context'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
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
  // 복원은 휴지통 관리이므로 purge 와 동일하게 asset.delete.any(owner/guardian) 필요.
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!resolveCan(ctx.membership.role, 'asset.delete.any', familyCaps)) {
    return errorJsonKey('asset.restoreDenied', 403)
  }
  try {
    const { id } = await params
    await restoreAsset(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorJson(e)
  }
}
