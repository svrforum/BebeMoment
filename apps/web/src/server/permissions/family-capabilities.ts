import { type Capability, effectiveFamilyCapabilities } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { cache } from 'react'
import { z } from 'zod'
import { getSetting } from '@/server/settings/get'

const GrantsSchema = z.array(z.string())

/**
 * Request-scoped dedup. Within one server render the family-capabilities
 * settings row is unchanged, so resolveContext + each service call (e.g.
 * startUpload, attachTag, …) would issue the same appSetting.findUnique
 * over and over. React `cache()` collapses to one call per request render.
 * The cache key includes the PrismaClient identity so test setups passing
 * a separate prisma don't collide.
 *
 * Note: React `cache()` is a no-op in test/CLI contexts (no request scope)
 * — calls just fall through to the underlying query, which is fine.
 */
export const getFamilyCapabilities = cache(_getFamilyCapabilities)

async function _getFamilyCapabilities(prisma: PrismaClient): Promise<Set<Capability>> {
  const granted = await getSetting('permissions.family', GrantsSchema, [], prisma)
  return effectiveFamilyCapabilities(granted)
}
