import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJsonKey } from '@/lib/error-response'
import { resolveContext } from '@/server/context'
import { NextResponse } from 'next/server'

// 멤버 누구나 현재 가족 이름을 읽는다 — 앱의 다중 계정 라벨용(admin 전용
// /api/admin/family 와 달리 권한 없이). 가족 경계는 세션의 현재 가족으로 한정.
export async function GET() {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return errorJsonKey('noFamily', 400)
  return NextResponse.json({ name: ctx.family.name })
}
