import { requireRouteContext } from '@/lib/route-context'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { deleteAlbum } from '@/server/album/delete'
import { getAlbumWithBreadcrumbs } from '@/server/album/get'
import { moveAlbum } from '@/server/album/move'
import { updateAlbum } from '@/server/album/update'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const { id } = await params
    const album = await getAlbumWithBreadcrumbs(
      { albumId: id, familyId: ctx.family.id, viewerRole: ctx.membership.role },
      prismaPublic,
    )
    if (!album) return errorJsonKey('album.notFound', 404)
    return NextResponse.json({ album })
  } catch (e) {
    return errorJson(e)
  }
}

/**
 * Body shapes:
 *   { name?, description?, coverAssetId? }    — rename / metadata
 *   { parentId: string | null }               — move (separate so the path
 *                                                 rewrite logic is explicit)
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('albums', prismaPublic)))
    return errorJsonKey('album.featureOff', 403)
  try {
    const { id } = await params
    const body = (await req.json()) as {
      name?: string
      description?: string | null
      coverAssetId?: string | null
      parentId?: string | null
      secret?: boolean
    }

    if ('parentId' in body) {
      const album = await moveAlbum(
        {
          albumId: id,
          familyId: ctx.family.id,
          byUserId: ctx.user.id,
          newParentId: body.parentId ?? null,
        },
        prismaPublic,
      )
      // Body might also include rename in the same request — apply after move.
      if (
        body.name !== undefined ||
        body.description !== undefined ||
        body.coverAssetId !== undefined
      ) {
        const updated = await updateAlbum(
          {
            albumId: id,
            familyId: ctx.family.id,
            byUserId: ctx.user.id,
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.coverAssetId !== undefined ? { coverAssetId: body.coverAssetId } : {}),
          },
          prismaPublic,
          prismaMedia,
        )
        return NextResponse.json({ album: updated })
      }
      return NextResponse.json({ album })
    }

    const album = await updateAlbum(
      {
        albumId: id,
        familyId: ctx.family.id,
        byUserId: ctx.user.id,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.coverAssetId !== undefined ? { coverAssetId: body.coverAssetId } : {}),
        ...(body.secret !== undefined ? { secret: body.secret } : {}),
      },
      prismaPublic,
      prismaMedia,
    )
    return NextResponse.json({ album })
  } catch (e) {
    return errorJson(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  if (!(await isFeatureEnabled('albums', prismaPublic)))
    return errorJsonKey('album.featureOff', 403)
  try {
    const { id } = await params
    const url = new URL(req.url)
    const cascade = url.searchParams.get('cascade') === 'true'
    const result = await deleteAlbum(
      {
        albumId: id,
        familyId: ctx.family.id,
        byUserId: ctx.user.id,
        cascade,
      },
      prismaPublic,
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
