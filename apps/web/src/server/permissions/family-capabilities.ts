import { type Capability, effectiveFamilyCapabilities } from '@bebe/core'
import type { PrismaClient } from '@bebe/db-public'
import { getSetting } from '@/server/settings/get'
import { z } from 'zod'

const GrantsSchema = z.array(z.string())

export async function getFamilyCapabilities(prisma: PrismaClient): Promise<Set<Capability>> {
  const granted = await getSetting('permissions.family', GrantsSchema, [], prisma)
  return effectiveFamilyCapabilities(granted)
}
