import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { listAlbumTree } from '@/server/album/list-tree'
import { resolveContext } from '@/server/context'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function GET() {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const tree = await listAlbumTree(ctx.family.id, ctx.membership?.role ?? 'family', prismaPublic)
    return NextResponse.json({ tree })
  } catch (e) {
    return errorJson(e)
  }
}
