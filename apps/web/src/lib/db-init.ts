import {
  installTenantMiddleware as installMediaMiddleware,
  prisma as prismaMediaBase,
} from '@bebe/db-media'
import {
  installTenantMiddleware as installPublicMiddleware,
  prisma as prismaPublicBase,
} from '@bebe/db-public'

// Prisma 7's $extends returns a NEW, immutable client (the old $use mutated in
// place). Build the tenant-isolated clients ONCE per process and reuse them via
// globalThis so Next's dev HMR / route isolation doesn't stack extensions.
const globalForInit = globalThis as unknown as {
  __bebePrismaPublic?: ReturnType<typeof installPublicMiddleware>
  __bebePrismaMedia?: ReturnType<typeof installMediaMiddleware>
}

const mode = process.env.NODE_ENV === 'production' ? 'warn' : 'throw'

if (!globalForInit.__bebePrismaPublic) {
  globalForInit.__bebePrismaPublic = installPublicMiddleware(prismaPublicBase, { mode })
}
if (!globalForInit.__bebePrismaMedia) {
  globalForInit.__bebePrismaMedia = installMediaMiddleware(prismaMediaBase, { mode })
}

export const prismaPublic = globalForInit.__bebePrismaPublic
export const prismaMedia = globalForInit.__bebePrismaMedia
