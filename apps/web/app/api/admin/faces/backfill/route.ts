import { errorJsonKey } from '@/lib/error-response'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { requireAdmin } from '@/lib/require-admin'
import { getContext } from '@/server/context'
import { faceClusterDistance, planFaceBackfill } from '@/server/people/backfill'
import { isFeatureEnabled } from '@/server/settings/features'
import { enqueueFaceDetect } from '@bebe/queue'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ scope: z.enum(['missing', 'all']).default('missing') })

/**
 * 이미 올라와 있는 사진을 다시 얼굴 인식한다(관리자). 탐지 로직이 바뀌었을 때 예전 사진에
 * 소급 적용하는 유일한 경로 — 평소엔 업로드 시점에만 돈다.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const ctx = await getContext()
  if (!ctx.family) return await errorJsonKey('noFamily', 400)
  // 기능이 꺼져 있으면 잡을 쌓아 봐야 아무도 처리하지 않는다.
  if (!(await isFeatureEnabled('faces', prismaPublic))) return await errorJsonKey('badRequest', 400)

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return await errorJsonKey('badRequest', 400)

  const { assetIds, plan } = await planFaceBackfill(
    { familyId: ctx.family.id, scope: parsed.data.scope },
    prismaMedia,
  )
  const clusterDistance = await faceClusterDistance(prismaPublic)
  for (const assetId of assetIds) {
    await enqueueFaceDetect({
      type: 'face-detect',
      familyId: ctx.family.id,
      assetId,
      clusterDistance,
    })
  }
  return NextResponse.json(plan)
}
