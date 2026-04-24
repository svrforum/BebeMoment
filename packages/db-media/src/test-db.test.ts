import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { type TestDb, startTestDb } from './test-db'

describe('db-media test-db', () => {
  let db: TestDb
  beforeAll(async () => {
    db = await startTestDb()
  }, 120_000)
  afterAll(async () => {
    await db.stop()
  })

  test('media.assets table reachable', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint as count FROM media.assets',
    )
    expect(rows[0]?.count).toBeDefined()
  })
})
