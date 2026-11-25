import { requireRouteContext } from '@/lib/route-context'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { createAlbum } from '@/server/album/create'
import { listAlbums } from '@/server/album/list'
import { isFeatureEnabled } from '@/server/settings/features'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const url = new URL(req.url)
    const parentId = url.searchParams.get('parentId')
    const viewerRole = ctx.membership.role
    const albums = await listAlbums({ familyId: ctx.family.id, parentId, viewerRole }, prismaPublic)
    return NextResponse.json({ albums })
  } catch (e) {
    return errorJson(e)
  }
}

export async function POST(req: Request) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('albums', prismaPublic)))
    return errorJsonKey('album.featureOff', 403)
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
