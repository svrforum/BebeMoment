import { type PrismaClient, installTenantMiddleware, prisma as prismaBase } from '@bebe/db-media'

// installTenantMiddleware returns the $extends-wrapped client (Prisma 7).
// The base client (prismaBase) is already constructed with the pg driver
// adapter inside @bebe/db-media — apps must NOT new up PrismaClient themselves,
// since the v7 constructor requires an adapter.
type TenantClient = PrismaClient

const globalForPrisma = globalThis as unknown as {
  __bebeMediaSvcPrisma?: TenantClient
}

function getPrisma(): TenantClient {
  if (!globalForPrisma.__bebeMediaSvcPrisma) {
    globalForPrisma.__bebeMediaSvcPrisma = installTenantMiddleware(prismaBase, {
      mode: process.env.NODE_ENV === 'production' ? 'warn' : 'throw',
    })
  }
  return globalForPrisma.__bebeMediaSvcPrisma
}

export const prisma: TenantClient = new Proxy({} as TenantClient, {
  get(_target, prop) {
    const inner = getPrisma() as unknown as Record<string | symbol, unknown>
    const value = inner[prop]
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(inner)
      : value
  },
})
