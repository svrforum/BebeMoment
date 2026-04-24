import { PrismaClient, installTenantMiddleware } from '@bebe/db-media'

const globalForPrisma = globalThis as unknown as {
  __bebeMediaSvcPrisma?: PrismaClient
}

function buildPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  })
  installTenantMiddleware(client, {
    mode: process.env.NODE_ENV === 'production' ? 'warn' : 'throw',
  })
  return client
}

function getPrisma(): PrismaClient {
  if (!globalForPrisma.__bebeMediaSvcPrisma) {
    globalForPrisma.__bebeMediaSvcPrisma = buildPrisma()
  }
  return globalForPrisma.__bebeMediaSvcPrisma
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const inner = getPrisma() as unknown as Record<string | symbol, unknown>
    const value = inner[prop]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(inner) : value
  },
})
