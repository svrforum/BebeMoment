import { PrismaClient } from '../prisma/generated/client'

const globalForPrisma = globalThis as unknown as { prismaMedia?: PrismaClient }

export const prisma =
  globalForPrisma.prismaMedia ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaMedia = prisma

export * from '../prisma/generated/client'
export { installTenantMiddleware } from './tenant-middleware'
// Test helpers live at './test-db'; deep-import to keep testcontainers out of
// production webpack bundles.
