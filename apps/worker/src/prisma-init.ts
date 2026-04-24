import { installTenantMiddleware, prisma } from '@bebe/db-media'

const globalForInit = globalThis as unknown as { __bebeMediaMwInstalled?: boolean }

if (!globalForInit.__bebeMediaMwInstalled) {
  installTenantMiddleware(prisma, {
    mode: process.env.NODE_ENV === 'production' ? 'warn' : 'throw',
  })
  globalForInit.__bebeMediaMwInstalled = true
}

export { prisma }
