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

describe('tenant-middleware (public)', () => {
  test('Family.findMany without id/slug/familyId throws in throw mode', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Family', action: 'findMany', args: { where: {} } }),
    ).rejects.toThrow(/\[tenant-middleware:public\] Family\.findMany.*without familyId filter/)
  })

  test('Family.findMany with where.id allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Family', action: 'findMany', args: { where: { id: 'fam1' } } }),
    ).resolves.toBeNull()
  })

  test('Family.findUnique with where.slug allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Family', action: 'findUnique', args: { where: { slug: 'abc' } } }),
    ).resolves.toBeNull()
  })

  test('Membership.findMany with where.userId allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Membership', action: 'findMany', args: { where: { userId: 'u1' } } }),
    ).resolves.toBeNull()
  })

  test('Invite.findUnique with where.token allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Invite', action: 'findUnique', args: { where: { token: 'tok' } } }),
    ).resolves.toBeNull()
  })

  test('Baby.findMany without familyId throws', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Baby', action: 'findMany', args: { where: {} } }),
    ).rejects.toThrow(/Baby\.findMany.*without familyId filter/)
  })

  test('Baby.findMany with familyId allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({
        model: 'Baby',
        action: 'findMany',
        args: { where: { familyId: 'fam1' } },
      }),
    ).resolves.toBeNull()
  })

  test('Milestone.update with compound unique familyId_babyId_presetKey allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({
        model: 'Milestone',
        action: 'update',
        args: {
          where: {
            familyId_babyId_presetKey: {
              familyId: 'fam1',
              babyId: 'baby1',
              presetKey: 'first_smile',
            },
          },
          data: { achievedAt: new Date() },
        },
      }),
    ).resolves.toBeNull()
  })

  test('non-scoped model (Session) is skipped and always allowed', async () => {
    const prisma = install('throw')
    await expect(
      prisma.run({ model: 'Session', action: 'findMany', args: { where: {} } }),
    ).resolves.toBeNull()
  })

  test('warn mode logs but does not throw', async () => {
    const prisma = install('warn')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      prisma.run({ model: 'Baby', action: 'findMany', args: { where: {} } }),
    ).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[tenant-middleware:public\] Baby\.findMany/),
    )
    warnSpy.mockRestore()
  })

  test('non-relevant actions (queryRaw) pass through without check', async () => {
    const prisma = install('throw')
    await expect(prisma.run({ model: 'Baby', action: 'queryRaw', args: {} })).resolves.toBeNull()
    await expect(prisma.run({ model: 'Baby', action: 'executeRaw', args: {} })).resolves.toBeNull()
  })
})
