import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../prisma/generated/client/client'

const globalForPrisma = globalThis as unknown as { prismaPublic?: PrismaClient }

function resolveUrl(): string | undefined {
  return process.env.DATABASE_URL_WEB ?? process.env.DATABASE_URL
}

function buildPrisma(): PrismaClient {
  const connectionString = resolveUrl()
  // Prisma 7 connects through a driver adapter. PrismaPg owns the connection
  // string (the datasource block no longer carries `url`). `schema: 'public'`
  // pins the search path so unqualified queries hit the public schema only.
  const adapter = new PrismaPg({ connectionString }, { schema: 'public' })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prismaPublic) {
    globalForPrisma.prismaPublic = buildPrisma()
  }
  return globalForPrisma.prismaPublic
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
