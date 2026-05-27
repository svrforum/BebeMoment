import { FEATURE_FLAGS, type FeatureFlag, type FeatureFlags, resolveFeatureFlags } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'
import { getSetting } from './get'

/** Single-flag check (defaults to enabled when unset). For API gating. */
export async function isFeatureEnabled(flag: FeatureFlag, prisma: PrismaClient): Promise<boolean> {
  return getSetting(`features.${flag}`, z.boolean(), true, prisma)
}

/** Instance-wide feature flags, defaulting any unset key to enabled. */
export async function getFeatureFlags(prisma: PrismaClient): Promise<FeatureFlags> {
  const bool = z.boolean()
  const entries = await Promise.all(
    FEATURE_FLAGS.map(
      async (k) =>
        [`features.${k}`, await getSetting(`features.${k}`, bool, true, prisma)] as const,
    ),
  )
  return resolveFeatureFlags(Object.fromEntries(entries))
}
