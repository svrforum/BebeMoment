import { PrismaClient } from '../prisma/generated/client'

const globalForPrisma = globalThis as unknown as { prismaMedia?: PrismaClient }

function resolveUrl(): string | undefined {
  return process.env.DATABASE_URL_MEDIA ?? process.env.DATABASE_URL
}

function buildPrisma(): PrismaClient {
  const url = resolveUrl()
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  })
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prismaMedia) {
    globalForPrisma.prismaMedia = buildPrisma()
  }
  return globalForPrisma.prismaMedia
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const inner = getPrisma() as unknown as Record<string | symbol, unknown>
    const value = inner[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(inner)
      : value
  },
})

export * from '../prisma/generated/client'
export { installTenantMiddleware } from './tenant-middleware'
// Test helpers live at './test-db'; deep-import to keep testcontainers out of
// production webpack bundles.
