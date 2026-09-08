import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient as PrismaMedia } from '@bebe/db-media'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

/**
 * 살아있는 DB 경계는 **한 방향뿐**이다: `bebe_media` 는 `public` 스키마를 못 읽는다.
 * `apps/media` 는 이 연결 하나만 들고 돌므로(패키지 의존성에도 `@bebe/db-public` 이 없다),
 * 이 REVOKE 가 CLAUDE.md §8/§9 의 "media 는 public 을 안 본다"를 실제로 강제한다.
 *
 * 반대 방향은 **경계가 아니다.** `apps/web` 은 `@bebe/db-media` 로 media 스키마를 직접
 * 읽고 쓴다 — 그 쿼리는 `bebe_web` 이 아니라 `DATABASE_URL_MEDIA`(=`bebe_media`) 연결로
 * 나간다. 그러니 "`bebe_web` 은 media.assets 를 못 읽는다"를 테스트해 봐야 앱이 쓰지 않는
 * 경로를 지키는 것이고, 경계가 있다는 인상만 남긴다. 여기서 뺀 이유다. (같은 이유로
 * `media.assets_v_public` 뷰 테스트도 뺐다 — 그 뷰는 아무도 읽지 않는다. 마이그레이션
 * 20260908140000 의 COMMENT 참조.)
 */
describe('DB role boundary — media role cannot reach the public schema', () => {
  let db: FullTestDb
  let mediaPrisma: PrismaMedia

  beforeAll(async () => {
    db = await startFullTestDb()

    await db.prismaPublic.$executeRawUnsafe(`ALTER ROLE bebe_media PASSWORD 'tm'`)

    const u = new URL(db.url)
    u.username = 'bebe_media'
    u.password = 'tm'
    mediaPrisma = new PrismaMedia({
      adapter: new PrismaPg({ connectionString: u.toString() }, { schema: 'media' }),
    })
  }, 240_000)

  afterAll(async () => {
    await mediaPrisma.$disconnect()
    await db.stop()
  })

  test('media role cannot SELECT from public.users', async () => {
    await expect(
      mediaPrisma.$queryRawUnsafe('SELECT id FROM public.users LIMIT 1'),
    ).rejects.toThrow(/permission denied/i)
  })

  test('media role cannot SELECT from public.families', async () => {
    await expect(
      mediaPrisma.$queryRawUnsafe('SELECT id FROM public.families LIMIT 1'),
    ).rejects.toThrow(/permission denied/i)
  })

  test('media role CAN SELECT from media.assets', async () => {
    const rows = await mediaPrisma.$queryRawUnsafe<Array<unknown>>(
      'SELECT id FROM media.assets LIMIT 1',
    )
    expect(Array.isArray(rows)).toBe(true)
  })
})
