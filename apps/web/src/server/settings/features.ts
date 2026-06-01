import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAGS,
  type FeatureFlag,
  type FeatureFlags,
  resolveFeatureFlags,
} from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { z } from 'zod'
import { getSetting } from './get'

/** Single-flag check (defaults to the flag's default when unset). For API gating. */
export async function isFeatureEnabled(flag: FeatureFlag, prisma: PrismaClient): Promise<boolean> {
  return getSetting(`features.${flag}`, z.boolean(), DEFAULT_FEATURE_FLAGS[flag], prisma)
}

/** Instance-wide feature flags, defaulting any unset key to its default. */
export async function getFeatureFlags(prisma: PrismaClient): Promise<FeatureFlags> {
  const bool = z.boolean()
  const entries = await Promise.all(
    FEATURE_FLAGS.map(
      async (k) =>
        [
          `features.${k}`,
          await getSetting(`features.${k}`, bool, DEFAULT_FEATURE_FLAGS[k], prisma),
        ] as const,
    ),
  )
  return resolveFeatureFlags(Object.fromEntries(entries))
}
