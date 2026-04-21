import { installTenantMiddleware, prisma } from '@bebe/db'

type Globals = { __bebe_tenant_installed__?: boolean }
const g = globalThis as Globals
if (!g.__bebe_tenant_installed__) {
  installTenantMiddleware(prisma, {
    mode: process.env.NODE_ENV === 'production' ? 'warn' : 'throw',
  })
  g.__bebe_tenant_installed__ = true
}

export { prisma }
