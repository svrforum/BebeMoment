import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { resolveContext } from '@/server/context'
import { mergeManyPeople } from '@/server/people/list'
import { isFeatureEnabled } from '@/server/settings/features'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  targetId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).min(1).max(200),
})

/**
 * 여러 군집을 한 번에 합친다 — 목록에서 골라서. 사진 한 장짜리 군집이 수십 개 생기는 게
 * 흔해서, 하나씩 상세로 들어가 합치는 건 사실상 못 쓴다.
 * 이름 변경과 같은 가족 공유 메타데이터 변경이라 person.rename 능력으로 게이트.
 */
export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return await errorJsonKey('unauthorized', 401)
  if (!(await isFeatureEnabled('faces', prismaPublic)))
    return await errorJsonKey('featureOff.faces', 403)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family) return await errorJsonKey('noFamily', 400)
  if (!ctx.capabilities.includes('person.rename')) return await errorJsonKey('forbidden', 403)
  try {
    const { targetId, sourceIds } = bodySchema.parse(await req.json())
    const result = await mergeManyPeople(
      { familyId: ctx.family.id, sourceIds, targetId },
      prismaMedia,
    )
    return NextResponse.json({ ok: true, targetId, ...result })
  } catch (e) {
    return errorJson(e)
  }
}
