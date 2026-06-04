import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { detachEntryFromAlbum } from '@/server/album/detach-entry'
import { resolveContext } from '@/server/context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const { id, entryId } = await params
    const result = await detachEntryFromAlbum(
      { albumId: id, storyId: entryId, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
