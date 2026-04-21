import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installTenantMiddleware } from './tenant-middleware'
import { type TestDb, startTestDb } from './test-db'

let db: TestDb

beforeAll(async () => {
  db = await startTestDb()
  installTenantMiddleware(db.prisma, { mode: 'throw' })
})
afterAll(async () => {
  await db.stop()
})

describe('tenant middleware', () => {
  it('throws on findMany without familyId filter', async () => {
    await expect(db.prisma.asset.findMany({})).rejects.toThrow(/familyId/)
  })

  it('allows query with familyId', async () => {
    await expect(
      db.prisma.asset.findMany({ where: { familyId: '00000000-0000-0000-0000-000000000000' } }),
    ).resolves.toEqual([])
  })

  it('does not apply to user model (not tenant-scoped)', async () => {
    await expect(db.prisma.user.findMany({})).resolves.toEqual([])
  })

  it('allows Membership query filtered by userId', async () => {
    await expect(
      db.prisma.membership.findMany({
        where: { userId: '00000000-0000-0000-0000-000000000000' },
      }),
    ).resolves.toEqual([])
  })
})
