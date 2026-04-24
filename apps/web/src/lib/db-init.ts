import {
  installTenantMiddleware as installPublicMiddleware,
  prisma as prismaPublic,
} from '@bebe/db-public'
import {
  installTenantMiddleware as installMediaMiddleware,
  prisma as prismaMedia,
} from '@bebe/db-media'

const globalForInit = globalThis as unknown as { __bebeMwInstalled?: boolean }

if (!globalForInit.__bebeMwInstalled) {
  const mode = process.env.NODE_ENV === 'production' ? 'warn' : 'throw'
  installPublicMiddleware(prismaPublic, { mode })
  installMediaMiddleware(prismaMedia, { mode })
  globalForInit.__bebeMwInstalled = true
}

export { prismaPublic, prismaMedia }
