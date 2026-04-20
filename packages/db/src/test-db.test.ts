import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestDb, startTestDb } from './test-db'

describe('test-db', () => {
  let db: TestDb

  beforeAll(async () => {
    db = await startTestDb()
  })
  afterAll(async () => {
    await db.stop()
  })

  it('creates and queries a user', async () => {
    const user = await db.prisma.user.create({
      data: {
        email: 'a@b.com',
        displayName: 'Alice',
        passwordHash: 'bcrypt-placeholder',
      },
    })
    expect(user.id).toBeTruthy()
    expect(user.email).toBe('a@b.com')

    const found = await db.prisma.user.findUnique({ where: { id: user.id } })
    expect(found?.displayName).toBe('Alice')
  })

  it('enforces unique email', async () => {
    await expect(
      db.prisma.user.create({ data: { email: 'a@b.com', displayName: 'Dup' } }),
    ).rejects.toThrow()
  })
})
