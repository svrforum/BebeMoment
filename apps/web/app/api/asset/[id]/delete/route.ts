import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { softDeleteAsset } from '@/server/asset/soft-delete'
import { resolveContext } from '@/server/context'
import { getPublisher } from '@/server/upload/pubsub'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { id } = await params
    await softDeleteAsset(
      { assetId: id, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
      prismaMedia,
      getPublisher(),
    )
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
