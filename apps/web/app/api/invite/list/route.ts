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
  // 초대 토큰은 bearer 가입 자격증명 — 발행 권한(member.invite, owner/guardian 전용)이
  // 있는 역할만 목록(토큰 포함)을 읽을 수 있게 게이트. create/revoke 와 동일 경계.
  if (!ctx.capabilities.includes('member.invite')) return errorJsonKey('forbidden', 403)
  const invites = await listInvites({ familyId: ctx.family.id }, prismaPublic)
  return NextResponse.json({ invites })
}
