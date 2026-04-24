import { installTenantMiddleware, prisma } from '@bebe/db-media'

const globalForInit = globalThis as unknown as { __bebeMediaMwInstalledSvc?: boolean }

if (!globalForInit.__bebeMediaMwInstalledSvc) {
  installTenantMiddleware(prisma, {
    mode: process.env.NODE_ENV === 'production' ? 'warn' : 'throw',
  })
  globalForInit.__bebeMediaMwInstalledSvc = true
}

export { prisma }
