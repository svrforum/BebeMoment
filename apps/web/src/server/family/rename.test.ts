import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signup } from '../auth/signup'
import { createFamily } from './create'
import { renameFamily } from './rename'

let db: FullTestDb

beforeAll(async () => {
  db = await startFullTestDb()
})
afterAll(async () => {
  await db.stop()
})
beforeEach(async () => {
  await db.prismaPublic.membership.deleteMany()
  await db.prismaPublic.family.deleteMany()
  await db.prismaPublic.user.deleteMany()
})

describe('renameFamily', () => {
  async function seedFamily() {
    const { user } = await signup(
      { email: 'a@b.com', password: 'password123', displayName: 'A' },
      db.prismaPublic,
    )
    const { family } = await createFamily({ name: '딸기네', userId: user.id }, db.prismaPublic)
    return family
  }

  it('renames the family', async () => {
    const family = await seedFamily()
    const updated = await renameFamily(family.id, '  포도네  ', db.prismaPublic)
    expect(updated.name).toBe('포도네')
    const row = await db.prismaPublic.family.findUnique({ where: { id: family.id } })
    expect(row?.name).toBe('포도네')
  })

  it('rejects an empty name', async () => {
    const family = await seedFamily()
    await expect(renameFamily(family.id, '   ', db.prismaPublic)).rejects.toThrow()
  })
})
