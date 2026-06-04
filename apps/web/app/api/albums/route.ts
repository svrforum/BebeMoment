import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { createAlbum } from '@/server/album/create'
import { listAlbums } from '@/server/album/list'
import { resolveContext } from '@/server/context'
import { isFeatureEnabled } from '@/server/settings/features'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const url = new URL(req.url)
    const parentId = url.searchParams.get('parentId')
    const viewerRole = ctx.membership?.role ?? 'family'
    const albums = await listAlbums({ familyId: ctx.family.id, parentId, viewerRole }, prismaPublic)
    return NextResponse.json({ albums })
  } catch (e) {
    return errorJson(e)
  }
}

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  if (!(await isFeatureEnabled('albums', prismaPublic)))
    return errorJsonKey('album.featureOff', 403)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return errorJsonKey('noFamily', 400)
  try {
    const body = await req.json()
    const album = await createAlbum(
      { ...body, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    revalidatePath('/albums', 'layout')
    return NextResponse.json({ album })
  } catch (e) {
    return errorJson(e)
  }
}
