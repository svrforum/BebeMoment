import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { attachAssetsToAlbum } from '@/server/album/attach-assets'
import { resolveContext } from '@/server/context'
import { toHttpError } from '@/server/error'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const { id } = await params
    const body = (await req.json()) as { assetIds: string[] }
    const result = await attachAssetsToAlbum(
      {
        albumId: id,
        familyId: ctx.family.id,
        byUserId: ctx.user.id,
        assetIds: body.assetIds,
      },
      prismaPublic,
      prismaMedia,
    )
    revalidatePath('/albums', 'layout')
    return NextResponse.json(result)
  } catch (e) {
    {
      const { status, message } = toHttpError(e)
      return NextResponse.json({ error: message }, { status })
    }
  }
}
