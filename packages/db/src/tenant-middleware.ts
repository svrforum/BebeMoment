import type { PrismaClient } from '@prisma/client'

const TENANT_SCOPED_MODELS = new Set([
  'Family',
  'Membership',
  'Invite',
  'Baby',
  'Asset',
  'AssetBaby',
])

type Mode = 'throw' | 'warn'

type Options = { mode?: Mode }

function containsKey(obj: unknown, key: string): boolean {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  if (key in o) return true
  for (const v of Object.values(o)) {
    if (Array.isArray(v) && v.some((x) => containsKey(x, key))) return true
    if (v && typeof v === 'object' && containsKey(v, key)) return true
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
      'count',
      'aggregate',
      'groupBy',
      'updateMany',
      'deleteMany',
    ]
    if (!relevantActions.includes(action)) return next(params)

    const where = (args as { where?: Record<string, unknown> })?.where ?? {}
    const hasFilter =
      'familyId' in where ||
      'family_id' in where ||
      containsKey(where, 'familyId') ||
      containsKey(where, 'family_id') ||
      (model === 'Family' && ('id' in where || containsKey(where, 'id'))) ||
      (model === 'Membership' &&
        ('userId' in where || containsKey(where, 'userId') || containsKey(where, 'user_id')))

    if (!hasFilter) {
      const msg = `[tenant-middleware] ${model}.${action} called without familyId filter`
      if (mode === 'throw') throw new Error(msg)
      console.warn(msg)
    }
    return next(params)
  })
}
