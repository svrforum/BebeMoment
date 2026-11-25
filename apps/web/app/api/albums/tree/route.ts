import { requireRouteContext } from '@/lib/route-context'
import { prismaPublic } from '@/lib/db-init'
import { listAlbumTree } from '@/server/album/list-tree'
import { errorJson } from '@/lib/error-response'
import { NextResponse } from 'next/server'

export async function GET() {
  const ctx = await requireRouteContext()
  if (ctx instanceof NextResponse) return ctx
  try {
    const tree = await listAlbumTree(ctx.family.id, ctx.membership.role, prismaPublic)
    return NextResponse.json({ tree })
  } catch (e) {
    return errorJson(e)
  }
}
