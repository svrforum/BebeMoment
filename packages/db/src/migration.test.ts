import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { type TestDb, startTestDb } from './test-db'

describe('media schema migration', () => {
  let db: TestDb
  beforeAll(async () => {
    db = await startTestDb()
  }, 120_000)
  afterAll(async () => {
    await db.stop()
  })

  test('media schema exists', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ nspname: string }>>(
      `SELECT nspname FROM pg_namespace WHERE nspname = 'media'`,
    )
    expect(rows).toHaveLength(1)
  })

  test('assets table lives in media schema', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ table_schema: string }>>(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = 'assets'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.table_schema).toBe('media')
  })

  test('asset_babies table lives in media schema', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ table_schema: string }>>(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = 'asset_babies'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.table_schema).toBe('media')
  })

  test('assets_v_public view exists and has expected columns', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'media' AND table_name = 'assets_v_public'
       ORDER BY ordinal_position`,
    )
    const cols = rows.map((r) => r.column_name)
    expect(cols).toContain('id')
    expect(cols).toContain('family_id')
    expect(cols).toContain('status')
    expect(cols).toContain('deleted_at')
    expect(cols).toContain('baby_ids')
  })

  test('bebe_web and bebe_media roles exist', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ rolname: string }>>(
      `SELECT rolname FROM pg_roles WHERE rolname IN ('bebe_web', 'bebe_media') ORDER BY rolname`,
    )
    expect(rows.map((r) => r.rolname)).toEqual(['bebe_media', 'bebe_web'])
  })

  test('asset enum types live in media schema', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ typname: string; nspname: string }>>(
      `SELECT t.typname, n.nspname
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname IN ('asset_kind', 'asset_status', 'taken_at_source', 'visibility', 'detection_source')
        ORDER BY t.typname`,
    )
    expect(rows).toHaveLength(5)
    for (const r of rows) expect(r.nspname).toBe('media')
  })
})
