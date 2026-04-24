import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prismaPublic?: PrismaClient }

export const prisma =
  globalForPrisma.prismaPublic ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaPublic = prisma

export * from '@prisma/client'
export { installTenantMiddleware } from './tenant-middleware'
