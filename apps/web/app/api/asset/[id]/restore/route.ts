import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { restoreAsset } from '@/server/asset/restore'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
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
