import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { createAlbum } from '@/server/album/create'
import { listAlbums } from '@/server/album/list'
import { resolveContext } from '@/server/context'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user)
    return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const url = new URL(req.url)
    const parentId = url.searchParams.get('parentId')
    const albums = await listAlbums(
      { familyId: ctx.family.id, parentId },
      prismaPublic,
    )
    return NextResponse.json({ albums })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user)
    return NextResponse.json({ error: 'No family' }, { status: 400 })
  try {
    const body = await req.json()
    const album = await createAlbum(
      { ...body, familyId: ctx.family.id, byUserId: ctx.user.id },
      prismaPublic,
    )
    return NextResponse.json({ album })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
