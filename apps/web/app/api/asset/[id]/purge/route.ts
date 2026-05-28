import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { purgeAsset } from '@/server/asset/purge'
import { resolveContext } from '@/server/context'
import { resolveCan } from '@bebe/core'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
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

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!resolveCan(ctx.membership.role, 'asset.delete.any', familyCaps)) {
    return NextResponse.json({ error: '영구 삭제 권한이 없어요' }, { status: 403 })
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
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
