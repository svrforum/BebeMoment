import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { revokeShareLink } from '@/server/share/manage'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user) return NextResponse.json({ error: 'No family' }, { status: 400 })
  const { token } = await params
  const ok = await revokeShareLink(token, ctx.family.id, prismaPublic)
  return NextResponse.json({ ok })
}
