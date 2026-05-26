import { type FullTestDb, startFullTestDb } from '@/test-support/db'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient as PrismaMedia } from '@bebe/db-media'
import { PrismaClient as PrismaPublic } from '@bebe/db-public'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('DB role boundary (Phase B M3)', () => {
  let db: FullTestDb
  let webPrisma: PrismaPublic
  let mediaPrisma: PrismaMedia

  beforeAll(async () => {
    db = await startFullTestDb()

    await db.prismaPublic.$executeRawUnsafe(`ALTER ROLE bebe_web PASSWORD 'tw'`)
    await db.prismaPublic.$executeRawUnsafe(`ALTER ROLE bebe_media PASSWORD 'tm'`)

    const u = new URL(db.url)
    u.username = 'bebe_web'
    u.password = 'tw'
    const urlWeb = u.toString()
    u.username = 'bebe_media'
    u.password = 'tm'
    const urlMedia = u.toString()

    webPrisma = new PrismaPublic({
      adapter: new PrismaPg({ connectionString: urlWeb }, { schema: 'public' }),
    })
    mediaPrisma = new PrismaMedia({
      adapter: new PrismaPg({ connectionString: urlMedia }, { schema: 'media' }),
    })
  }, 240_000)

  afterAll(async () => {
    await webPrisma.$disconnect()
    await mediaPrisma.$disconnect()
    await db.stop()
  })

  test('web role cannot SELECT from media.assets (raw table)', async () => {
    await expect(webPrisma.$queryRawUnsafe('SELECT id FROM media.assets LIMIT 1')).rejects.toThrow(
      /permission denied/i,
    )
  })

  test('web role cannot SELECT from media.asset_babies (raw table)', async () => {
    await expect(
      webPrisma.$queryRawUnsafe('SELECT asset_id FROM media.asset_babies LIMIT 1'),
    ).rejects.toThrow(/permission denied/i)
  })

  test('web role CAN SELECT from media.assets_v_public view', async () => {
    const rows = await webPrisma.$queryRawUnsafe<Array<unknown>>(
      'SELECT id FROM media.assets_v_public LIMIT 1',
    )
    expect(Array.isArray(rows)).toBe(true)
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
