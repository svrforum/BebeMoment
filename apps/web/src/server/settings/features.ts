import { FEATURE_FLAGS, type FeatureFlag, type FeatureFlags, resolveFeatureFlags } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { cache } from 'react'

const FLAG_KEYS = FEATURE_FLAGS.map((k) => `features.${k}`)

/**
 * 인스턴스 기능 플래그 — 키 7개를 findMany 한 번으로 읽고, 안 정해진(또는 boolean 이 아닌)
 * 값은 기본값. 레이아웃·페이지·API 게이트가 한 요청에서 여러 번 부르므로 요청 스코프
 * `cache()`(요청 밖에선 no-op).
 */
export const getFeatureFlags = cache(async (prisma: PrismaClient): Promise<FeatureFlags> => {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: FLAG_KEYS } },
    select: { key: true, value: true },
  })
  return resolveFeatureFlags(Object.fromEntries(rows.map((r) => [r.key, r.value])))
})

/** Single-flag check for API gating — same cached read as getFeatureFlags. */
export async function isFeatureEnabled(flag: FeatureFlag, prisma: PrismaClient): Promise<boolean> {
  return (await getFeatureFlags(prisma))[flag]
}
