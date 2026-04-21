import { getAuth } from '@/lib/auth'
import { prisma } from '@/lib/db-init'
import { acceptInvite } from '@/server/invite/accept'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const result = await acceptInvite({ token: body.token, userId: session.userId }, prisma)

    await prisma.session.update({
      where: { id: session.id },
      data: { currentFamilyId: result.familyId },
    })

    return NextResponse.json({ familyId: result.familyId })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
