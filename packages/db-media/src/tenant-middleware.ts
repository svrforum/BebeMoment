import type { PrismaClient } from '../prisma/generated/client/client'

const TENANT_SCOPED_MODELS = new Set(['Asset', 'AssetBaby'])

const RELEVANT_OPERATIONS = new Set([
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
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

function enforce(model: string | undefined, operation: string, args: unknown, mode: Mode): void {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return
  if (!RELEVANT_OPERATIONS.has(operation)) return

  const where = (args as { where?: Record<string, unknown> })?.where ?? {}

  // AssetBaby has no familyId column directly — it's scoped through asset.
  // Callers must filter by assetId (which transitively anchors to a family
  // via media.assets.family_id) or pass a familyId-like key. The middleware
  // accepts either as sufficient evidence of tenant scoping.
  const hasFilter =
    hasKeyTopLevel(where, 'familyId') ||
    hasKeyTopLevel(where, 'family_id') ||
    (model === 'AssetBaby' && hasKeyTopLevel(where, 'assetId'))

  if (!hasFilter) {
    const msg = `[tenant-middleware:media] ${model}.${operation} called without familyId filter`
    if (mode === 'throw') throw new Error(msg)
    console.warn(msg)
  }
}

/**
 * Prisma 7 removed `$use` query middleware. Tenant isolation is now a client
 * extension that intercepts every operation on every model and enforces a
 * familyId-scoped filter before the query runs. `$extends` returns a NEW,
 * immutable client — callers MUST use the returned value (the original client
 * is unchanged).
 */
export function installTenantMiddleware<T extends PrismaClient>(prisma: T, opts: Options = {}): T {
  const mode: Mode = opts.mode ?? 'warn'

  return prisma.$extends({
    name: 'tenant-isolation:media',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          enforce(model, operation, args, mode)
          return query(args)
        },
      },
    },
  }) as unknown as T
}
