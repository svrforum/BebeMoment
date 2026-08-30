import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { logger } from '@/lib/logger'
import { purgeAsset } from '@/server/asset/purge'
import { purgeMany } from '@/server/asset/purge-many'
import { resolveContext } from '@/server/context'
import { getFamilyCapabilities } from '@/server/permissions/family-capabilities'
import { resolveCan } from '@bebe/core'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 한 번에 받는 양을 묶어 둔다 — 영구 삭제는 파일까지 지우느라 오래 걸려서, 무한정
// 받으면 요청이 타임아웃되고 어디까지 지워졌는지 알 수 없게 된다. 넘치면 나눠 보낸다.
const Body = z.object({ assetIds: z.array(z.string().uuid()).min(1).max(200) })

export async function POST(req: Request) {
  const { session } = await getAuth()
  if (!session) return errorJsonKey('unauthorized', 401)
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  if (!ctx.family || !ctx.user || !ctx.membership) return errorJsonKey('noFamily', 400)

  const familyCaps = await getFamilyCapabilities(prismaPublic)
  if (!resolveCan(ctx.membership.role, 'asset.delete.any', familyCaps)) {
    return errorJsonKey('asset.purgeDenied', 403)
  }

  try {
    const { assetIds } = Body.parse(await req.json())
    const family = ctx.family
    const user = ctx.user
    const result = await purgeMany(assetIds, (assetId) =>
      purgeAsset({ assetId, familyId: family.id, byUserId: user.id }, prismaPublic, prismaMedia),
    )
    logger.info(
      {
        userId: user.id,
        familyId: family.id,
        requested: assetIds.length,
        purged: result.purged,
        failed: result.failed.length,
      },
      'trash bulk purge',
    )
    return NextResponse.json(result)
  } catch (e) {
    return errorJson(e)
  }
}
