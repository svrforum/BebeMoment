import { describe, expect, test, vi } from 'vitest'
import type { PrismaClient } from '../prisma/generated/client'
import { installTenantMiddleware } from './tenant-middleware'

type MiddlewareFn = (params: unknown, next: (p: unknown) => unknown) => unknown

function mkPrismaMock(): {
  $use: (m: MiddlewareFn) => void
  run: (p: unknown) => Promise<unknown>
} {
  const middlewares: Array<MiddlewareFn> = []
  return {
    $use(m) {
      middlewares.push(m)
    },
    async run(params) {
      const stack = [...middlewares]
      const next = async (p: unknown): Promise<unknown> => {
        const m = stack.shift()
        if (!m) return null
        return m(p, next)
      }
      return next(params)
    },
  }
}

function install(mode: 'throw' | 'warn' = 'throw') {
  const prisma = mkPrismaMock()
  installTenantMiddleware(prisma as unknown as PrismaClient, { mode })
  return prisma
}

describe('tenant-middleware (media)', () => {
  test('Asset.findMany without familyId throws', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Asset', action: 'findMany', args: { where: {} } }),
    ).rejects.toThrow(/\[tenant-middleware:media\] Asset\.findMany.*without familyId filter/)
  })

  test('Asset.findMany with familyId allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({
        model: 'Asset',
        action: 'findMany',
        args: { where: { familyId: 'fam1' } },
      }),
    ).resolves.toBeNull()
  })

  test('Asset.findUnique with compound familyId_sha256 wrapper allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({
        model: 'Asset',
        action: 'findUnique',
        args: {
          where: {
            familyId_sha256: { familyId: 'fam1', sha256: 'x'.repeat(64) },
          },
        },
      }),
    ).resolves.toBeNull()
  })

  test('AssetBaby.findFirst with assetId allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({
        model: 'AssetBaby',
        action: 'findFirst',
        args: { where: { assetId: 'asset1' } },
      }),
    ).resolves.toBeNull()
  })

  test('AssetBaby.findMany without assetId/familyId throws', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'AssetBaby', action: 'findMany', args: { where: {} } }),
    ).rejects.toThrow(/AssetBaby\.findMany.*without familyId filter/)
  })

  test('non-scoped model (User) is skipped and always allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'User', action: 'findMany', args: { where: {} } }),
    ).resolves.toBeNull()
  })

  test('warn mode logs but does not throw', async () => {
    const prisma = install('warn')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      prisma.run({ model: 'Asset', action: 'findMany', args: { where: {} } }),
    ).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[tenant-middleware:media\] Asset\.findMany/),
    )
    warnSpy.mockRestore()
  })

  test('Asset.count without familyId throws (non-findMany relevantAction)', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Asset', action: 'count', args: { where: {} } }),
    ).rejects.toThrow(/Asset\.count.*without familyId filter/)
  })

  test('non-relevant actions (queryRaw) pass through without check', async () => {
    const prisma = install('throw')
    await expect(prisma.run({ model: 'Asset', action: 'queryRaw', args: {} })).resolves.toBeNull()
  })
})
