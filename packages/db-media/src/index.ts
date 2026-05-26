import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../prisma/generated/client/client'

const globalForPrisma = globalThis as unknown as { prismaMedia?: PrismaClient }

function resolveUrl(): string | undefined {
  return process.env.DATABASE_URL_MEDIA ?? process.env.DATABASE_URL
}

function buildPrisma(): PrismaClient {
  const connectionString = resolveUrl()
  // Prisma 7 connects through a driver adapter. PrismaPg owns the connection
  // string (the datasource block no longer carries `url`). `schema: 'media'`
  // pins the search path so unqualified queries hit the media schema only.
  const adapter = new PrismaPg({ connectionString }, { schema: 'media' })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
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

export * from '../prisma/generated/client/client'
export { installTenantMiddleware } from './tenant-middleware'
// Test helpers live at './test-db'; deep-import to keep testcontainers out of
// production webpack bundles.
