import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { type TestDb, startTestDb } from './test-db'

describe('db-public test-db', () => {
  let db: TestDb
  beforeAll(async () => {
    db = await startTestDb()
  }, 120_000)
  afterAll(async () => {
    await db.stop()
  })

  test('public schema is reachable', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint as count FROM public.users',
    )
    expect(rows[0]?.count).toBeDefined()
  })

  test('media schema view is reachable', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint as count FROM media.assets_v_public',
    )
    expect(rows[0]?.count).toBeDefined()
  })
})
