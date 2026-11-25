import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startTestDb as startMediaTestDb } from '../../db-media/src/test-db'
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

  // web·media 의 테스트는 두 패키지의 startTestDb 를 한 프로세스에서 함께 부를 수 있다. DB 이름
  // 카운터가 패키지마다 따로면 둘 다 같은 이름을 만들려다 CREATE DATABASE 가 부딪친다.
  test('db-media 의 startTestDb 와 한 프로세스에서 불러도 다른 DB 를 만든다', async () => {
    const media = await startMediaTestDb()
    try {
      expect(media.url).not.toBe(db.url)
    } finally {
      await media.stop()
    }
  })

  test('media schema view is reachable', async () => {
    const rows = await db.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT count(*)::bigint as count FROM media.assets_v_public',
    )
    expect(rows[0]?.count).toBeDefined()
  })
})
