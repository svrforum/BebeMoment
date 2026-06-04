import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { acceptInvite } from '@/server/invite/accept'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  try {
    const body = await req.json()
    const result = await acceptInvite({ token: body.token, userId: session.userId }, prismaPublic)

    await prismaPublic.session.update({
      where: { id: session.id },
      data: { currentFamilyId: result.familyId },
    })

    return NextResponse.json({ familyId: result.familyId })
  } catch (e) {
    return errorJson(e)
  }
}
