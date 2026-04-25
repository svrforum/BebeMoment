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

  test('assets has blurhash / dominant_color / aspect_ratio_cached columns', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'media' AND table_name = 'assets'
          AND column_name IN ('blurhash', 'dominant_color', 'aspect_ratio_cached')
        ORDER BY column_name`,
    )
    expect(rows.map((r) => r.column_name)).toEqual([
      'aspect_ratio_cached',
      'blurhash',
      'dominant_color',
    ])
  })
})
