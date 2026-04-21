import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { resolveContext } from '@/server/context'
import { listInvites } from '@/server/invite/list'
import { NextResponse } from 'next/server'

export async function GET() {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prisma,
  )
  if (!ctx.family) return NextResponse.json({ error: 'No current family' }, { status: 400 })
  const invites = await listInvites({ familyId: ctx.family.id }, prisma)
  return NextResponse.json({ invites })
}
