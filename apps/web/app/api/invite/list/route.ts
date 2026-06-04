import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJsonKey } from '@/lib/error-response'
import { resolveContext } from '@/server/context'
import { listInvites } from '@/server/invite/list'
import { NextResponse } from 'next/server'

export async function GET() {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return errorJsonKey('noFamily', 400)
  const invites = await listInvites({ familyId: ctx.family.id }, prismaPublic)
  return NextResponse.json({ invites })
}
