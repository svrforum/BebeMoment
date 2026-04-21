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

  it('throws on findFirst without familyId filter', async () => {
    await expect(db.prisma.asset.findFirst({ where: { id: 'x' } })).rejects.toThrow(/familyId/)
  })

  it('throws on findUnique without familyId-compound where', async () => {
    // findUnique on Asset by id alone is tenant-scoped and must include familyId
    await expect(
      db.prisma.asset.findUnique({
        where: { id: '00000000-0000-0000-0000-000000000000' },
      }),
    ).rejects.toThrow(/familyId/)
  })

  it('allows findUnique when where uses familyId-compound unique', async () => {
    await expect(
      db.prisma.asset.findUnique({
        where: {
          familyId_sha256: {
            familyId: '00000000-0000-0000-0000-000000000000',
            sha256: 'x'.repeat(64),
          },
        },
      }),
    ).resolves.toBeNull()
  })

  it('throws on update without familyId filter', async () => {
    await expect(
      db.prisma.asset.update({
        where: { id: '00000000-0000-0000-0000-000000000000' },
        data: { status: 'ready' },
      }),
    ).rejects.toThrow(/familyId/)
  })

  it('throws on delete without familyId filter', async () => {
    await expect(
      db.prisma.asset.delete({
        where: { id: '00000000-0000-0000-0000-000000000000' },
      }),
    ).rejects.toThrow(/familyId/)
  })

  it('allows OR-branch familyId filter', async () => {
    await expect(
      db.prisma.asset.findMany({
        where: {
          OR: [{ familyId: '00000000-0000-0000-0000-000000000000' }],
        },
      }),
    ).resolves.toEqual([])
  })

  it('rejects deeply-nested familyId under arbitrary relation (top-level only)', async () => {
    // familyId nested under a relation (uploadedBy.someField) is not a valid tenant filter.
    await expect(
      db.prisma.asset.findMany({
        where: {
          uploadedBy: { familyId: '00000000-0000-0000-0000-000000000000' } as never,
        },
      }),
    ).rejects.toThrow(/familyId/)
  })
})
