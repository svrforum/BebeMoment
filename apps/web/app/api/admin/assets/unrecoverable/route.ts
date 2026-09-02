import { getMediaClient } from '@/lib/media-client'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { errorJson, errorJsonKey } from '@/lib/error-response'
import { logger } from '@/lib/logger'
import { requireAdmin } from '@/lib/require-admin'
import { softDeleteAsset } from '@/server/asset/soft-delete'
import { getPublisher } from '@/server/upload/pubsub'
import { getAuth } from '@/lib/auth'
import { resolveContext } from '@/server/context'
import { NextResponse } from 'next/server'

/** 관리자 확인과 별개로 현재 가족을 얻는다 — requireAdmin 은 가족을 주지 않는다. */
async function currentContext() {
  const { session } = await getAuth()
  if (!session) return null
  return resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 되살릴 수 없는 자산 정리 — 업로드가 중간에 끊겨 **바이트가 없는** 실패 행들.
 *
 * 그런 행은 재시도해도 매번 같은 ENOENT 로 끝나는데 화면엔 그냥 '실패'로 보여 계속 누르게
 * 되고, 목록에는 몇 달씩 남는다(5월 것이 9월까지 있었다). 자동으로 지우지는 않는다 —
 * 사진이 조용히 사라지는 것보다 사용자가 보고 치우는 편이 낫다(§2#6).
 *
 * 원본 유무 판정은 스토리지를 가진 media 가 하고(§10 — web 은 스토리지에 직접 접근하지
 * 않는다), 삭제는 public 스키마까지 정리해야 하므로 여기서 한다.
 */
export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const ctx = await currentContext()
  if (!ctx?.family) return errorJsonKey('noFamily', 400)
  try {
    const assetIds = await getMediaClient().unrecoverableAssetIds(ctx.family.id)
    return NextResponse.json({ count: assetIds.length, assetIds })
  } catch (e) {
    return errorJson(e)
  }
}

export async function POST() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const ctx = await currentContext()
  if (!ctx?.family || !ctx.user) return errorJsonKey('noFamily', 400)
  const family = ctx.family
  const user = ctx.user
  try {
    const assetIds = await getMediaClient().unrecoverableAssetIds(family.id)
    let removed = 0
    const failed: string[] = []
    for (const assetId of assetIds) {
      try {
        await softDeleteAsset(
          { assetId, familyId: family.id, byUserId: user.id },
          prismaPublic,
          prismaMedia,
          getPublisher(),
        )
        removed += 1
      } catch {
        failed.push(assetId)
      }
    }
    logger.info(
      {
        userId: user.id,
        familyId: family.id,
        found: assetIds.length,
        removed,
        failed: failed.length,
      },
      'unrecoverable assets cleaned',
    )
    return NextResponse.json({ removed, failed: failed.length })
  } catch (e) {
    return errorJson(e)
  }
}
