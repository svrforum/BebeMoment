import type { PrismaClient } from '../prisma/generated/client/client'

export const TENANT_SCOPED_MODELS = new Set([
  'Family',
  'Membership',
  'Invite',
  'Baby',
  'GrowthRecord',
  'Milestone',
  'MilestoneAsset',
  'Story',
  'StoryAsset',
  'AssetLike',
  'AssetBookmark',
  'StoryBookmark',
  'WidgetPhoto',
  'AssetComment',
  'Tag',
  'AssetTag',
  'Album',
  'AlbumAsset',
  'AlbumStory',
  'ShareLink',
  // NOTE: PushSubscription, NotificationPref are user-scoped (not family-scoped),
  // like Session — queried by userId, no familyId filter required.
])

// Models that carry a direct `familyId` column. Inserts on these MUST include
// it in the create payload. Family itself is its own anchor (no column),
// MilestoneAsset/StoryAsset are transitive join tables scoped through
// the parent row's familyId — they have no direct column either.
export const MODELS_WITH_FAMILY_ID_COLUMN = new Set([
  'Membership',
  'Invite',
  'Baby',
  'GrowthRecord',
  'Milestone',
  'Story',
  'AssetLike',
  'AssetBookmark',
  'StoryBookmark',
  'WidgetPhoto',
  'AssetComment',
  'Tag',
  'AssetTag',
  'Album',
  'AlbumAsset',
  'AlbumStory',
  'ShareLink',
])

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
  const msg = `[tenant-middleware:public] ${model}.${operation} called without familyId filter`
  if (mode === 'throw') throw new Error(msg)
  // TODO: route through pino to honor §17#7 secret-masking. Adding pino here
  // would introduce a new cross-package dependency for db-public — left as a
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
      // createMany: every row must include familyId
      const ok = data.every((row) => dataHasFamilyId(row))
      if (!ok) reportMissing(model, operation, mode)
      return
    }
    if (!dataHasFamilyId(data)) reportMissing(model, operation, mode)
    return
  }

  if (!READ_LIKE_OPERATIONS.has(operation)) return

  const where = (args as { where?: Record<string, unknown> })?.where ?? {}
  const hasFilter =
    hasKeyTopLevel(where, 'familyId') ||
    hasKeyTopLevel(where, 'family_id') ||
    (model === 'Family' && (hasKeyTopLevel(where, 'id') || hasKeyTopLevel(where, 'slug'))) ||
    (model === 'Invite' && hasKeyTopLevel(where, 'token')) ||
    (model === 'Membership' &&
      (hasKeyTopLevel(where, 'userId') || hasKeyTopLevel(where, 'user_id'))) ||
    // StoryAsset/MilestoneAsset 는 familyId 컬럼이 없는 조인 테이블(부모 행의 familyId 로
    // 전이 스코프)이라 familyId 로 못 거른다. entryId/assetId 는 이미 가족-스코프된 부모
    // 스토리·자산 id 라 그 키로 거는 직접 조회는 허용한다. (관계 include 는 익스텐션을 안
    // 타므로 무관. 키 없는 무필터 조회는 여전히 reportMissing.)
    ((model === 'StoryAsset' || model === 'MilestoneAsset') &&
      (hasKeyTopLevel(where, 'assetId') ||
        hasKeyTopLevel(where, 'asset_id') ||
        hasKeyTopLevel(where, 'entryId') ||
        hasKeyTopLevel(where, 'entry_id')))

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
    name: 'tenant-isolation:public',
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
