import type { PrismaClient } from '../prisma/generated/client/client'

const TENANT_SCOPED_MODELS = new Set(['Asset', 'AssetBaby'])

// Models that carry a direct `familyId` column. Inserts on these MUST include
// it in the create payload. AssetBaby is a transitive join table scoped
// through `assetId` — it has no direct column.
const MODELS_WITH_FAMILY_ID_COLUMN = new Set(['Asset'])

const READ_LIKE_OPERATIONS = new Set([
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

const CREATE_OPERATIONS = new Set(['create', 'createMany'])

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

function dataHasFamilyId(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  if ('familyId' in obj || 'family_id' in obj) return true
  // Nested connect via relation: { family: { connect: { id: ... } } }
  const fam = obj.family
  if (fam && typeof fam === 'object') {
    const connect = (fam as Record<string, unknown>).connect
    if (connect && typeof connect === 'object') {
      const c = connect as Record<string, unknown>
      if ('id' in c || 'slug' in c) return true
    }
    if ((fam as Record<string, unknown>).connectOrCreate) return true
  }
  return false
}

function reportMissing(model: string, operation: string, mode: Mode): void {
  const msg = `[tenant-middleware:media] ${model}.${operation} called without familyId filter`
  if (mode === 'throw') throw new Error(msg)
  // TODO: route through pino to honor §17#7 secret-masking. Adding pino here
  // would introduce a new cross-package dependency for db-media — left as a
  // follow-up. The middleware never logs payload values, only the model name
  // and operation, so there is no secret-leak path through this warn.
  console.warn(msg)
}

function enforce(model: string | undefined, operation: string, args: unknown, mode: Mode): void {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return

  if (CREATE_OPERATIONS.has(operation)) {
    if (!MODELS_WITH_FAMILY_ID_COLUMN.has(model)) return
    const data = (args as { data?: unknown })?.data
    if (Array.isArray(data)) {
      const ok = data.every((row) => dataHasFamilyId(row))
      if (!ok) reportMissing(model, operation, mode)
      return
    }
    if (!dataHasFamilyId(data)) reportMissing(model, operation, mode)
    return
  }

  if (!READ_LIKE_OPERATIONS.has(operation)) return

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
    reportMissing(model, operation, mode)
  }

  // upsert additionally carries a create branch; if the where matched, the
  // create payload still needs a familyId on models that have the column.
  if (operation === 'upsert' && MODELS_WITH_FAMILY_ID_COLUMN.has(model)) {
    const createPayload = (args as { create?: unknown })?.create
    if (!dataHasFamilyId(createPayload)) {
      reportMissing(model, `${operation}.create`, mode)
    }
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
