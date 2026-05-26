import { describe, expect, test, vi } from 'vitest'
import type { PrismaClient } from '../prisma/generated/client/client'
import { installTenantMiddleware } from './tenant-middleware'

type AllOps = (a: {
  model: string | undefined
  operation: string
  args: unknown
  query: (args: unknown) => Promise<unknown>
}) => Promise<unknown>

// Prisma 7 enforces tenant isolation via $extends instead of $use. The mock
// captures the registered $allOperations interceptor and exposes a `run` that
// invokes it exactly as the real client would (passing model/operation/args
// plus a `query` continuation that resolves to null).
function mkPrismaMock(): {
  $extends: (ext: { query?: { $allModels?: { $allOperations?: AllOps } } }) => unknown
  run: (p: { model?: string; action: string; args: unknown }) => Promise<unknown>
} {
  let captured: AllOps | undefined
  const self = {
    $extends(ext: { query?: { $allModels?: { $allOperations?: AllOps } } }) {
      captured = ext.query?.$allModels?.$allOperations
      return self
    },
    async run(p: { model?: string; action: string; args: unknown }) {
      if (!captured) return null
      return captured({
        model: p.model,
        operation: p.action,
        args: p.args,
        query: async () => null,
      })
    },
  }
  return self
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

  test('non-relevant operations (queryRaw) pass through without check', async () => {
    const prisma = install('throw')
    await expect(prisma.run({ model: 'Baby', action: 'queryRaw', args: {} })).resolves.toBeNull()
    await expect(prisma.run({ model: 'Baby', action: 'executeRaw', args: {} })).resolves.toBeNull()
  })
})
