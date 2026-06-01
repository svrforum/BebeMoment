import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { restoreAsset } from '@/server/asset/restore'
import { resolveContext } from '@/server/context'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user || !ctx.membership) {
    return NextResponse.json({ error: 'No family' }, { status: 400 })
  }
  // 복원은 휴지통 관리이므로 purge 와 동일하게 asset.delete.any(owner/guardian) 필요.
  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!resolveCan(ctx.membership.role, 'asset.delete.any', familyCaps)) {
    return NextResponse.json({ error: '복원 권한이 없어요' }, { status: 403 })
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
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
