import { getAuth } from '@/lib/auth'
import { prismaPublic } from '@/lib/db-init'
import { errorJsonKey } from '@/lib/error-response'
import { type ReadyContext, resolveContext } from '@/server/context'
import type { NextResponse } from 'next/server'

/**
 * 가족 구성원용 API 라우트의 공통 관문 — 미로그인은 401 `unauthorized`, 현재 가족이 없으면
 * (탈퇴·정지·가족 삭제 포함) 400 `noFamily`. 거절은 errorJsonKey 를 지나 로그·번역된다.
 *
 *   const ctx = await requireRouteContext()
 *   if (ctx instanceof NextResponse) return ctx
 */
export async function requireRouteContext(): Promise<ReadyContext | NextResponse> {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.user || !ctx.family || !ctx.membership) return errorJsonKey('noFamily', 400)
  return { ...ctx, user: ctx.user, family: ctx.family, membership: ctx.membership }
}
