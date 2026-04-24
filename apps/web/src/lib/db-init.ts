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

// 레거시 alias — Task 11 에서 apps/web/src/server/** 의 prisma 참조를
// prismaPublic / prismaMedia 로 명시적 교체하기 전까지 타입체크 통과용.
export const prisma = prismaPublic
