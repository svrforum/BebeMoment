import type { PrismaClient } from '@prisma/client'

const TENANT_SCOPED_MODELS = new Set([
  'Family',
  'Membership',
  'Invite',
  'Baby',
  'Asset',
  'AssetBaby',
  'GrowthRecord',
  'Milestone',
  'MilestoneAsset',
  'JournalEntry',
  'JournalEntryAsset',
  'AssetLike',
  'AssetBookmark',
  'AssetComment',
])

type Mode = 'throw' | 'warn'

type Options = { mode?: Mode }

function hasKeyTopLevel(where: Record<string, unknown>, key: string): boolean {
  if (key in where) return true
  // Prisma compound-unique wrappers like `familyId_sha256` encode the tenant
  // in the key name itself; accept them without descending into arbitrary values.
  for (const k of Object.keys(where)) {
    if (k.startsWith(`${key}_`) || k.endsWith(`_${key}`) || k.includes(`_${key}_`)) {
      return true
    }
  }
  for (const combinator of ['OR', 'AND', 'NOT'] as const) {
    const branch = where[combinator]
    if (Array.isArray(branch)) {
      if (
        branch.some(
          (b) => b && typeof b === 'object' && hasKeyTopLevel(b as Record<string, unknown>, key),
        )
      ) {
        return true
      }
    } else if (branch && typeof branch === 'object') {
      if (hasKeyTopLevel(branch as Record<string, unknown>, key)) return true
    }
  }
  return false
}

export function installTenantMiddleware(prisma: PrismaClient, opts: Options = {}): void {
  const mode: Mode = opts.mode ?? 'warn'

  prisma.$use(async (params, next) => {
    const { model, action, args } = params
    if (!model || !TENANT_SCOPED_MODELS.has(model)) return next(params)

    const relevantActions = [
      'findMany',
      'findUnique',
      'findFirst',
      'count',
      'aggregate',
      'groupBy',
      'update',
      'updateMany',
      'delete',
      'deleteMany',
      'upsert',
    ]
    if (!relevantActions.includes(action)) return next(params)

    const where = (args as { where?: Record<string, unknown> })?.where ?? {}
    const hasFilter =
      hasKeyTopLevel(where, 'familyId') ||
      hasKeyTopLevel(where, 'family_id') ||
      (model === 'Family' && (hasKeyTopLevel(where, 'id') || hasKeyTopLevel(where, 'slug'))) ||
      (model === 'Invite' && hasKeyTopLevel(where, 'token')) ||
      (model === 'Membership' &&
        (hasKeyTopLevel(where, 'userId') || hasKeyTopLevel(where, 'user_id')))

    if (!hasFilter) {
      const msg = `[tenant-middleware] ${model}.${action} called without familyId filter`
      if (mode === 'throw') throw new Error(msg)
      console.warn(msg)
    }
    return next(params)
  })
}
