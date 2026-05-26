import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient as PrismaMedia } from '@bebe/db-media'
import { startTestDb as startPublicDb } from '@bebe/db-public/src/test-db'

export type FullTestDb = {
  url: string
  prismaPublic: Awaited<ReturnType<typeof startPublicDb>>['prisma']
  prismaMedia: PrismaMedia
  stop: () => Promise<void>
}

export async function startFullTestDb(): Promise<FullTestDb> {
  const pub = await startPublicDb()
  const mediaAdapter = new PrismaPg({ connectionString: pub.url }, { schema: 'media' })
  const mediaPrisma = new PrismaMedia({ adapter: mediaAdapter })
  return {
    url: pub.url,
    prismaPublic: pub.prisma,
    prismaMedia: mediaPrisma,
    stop: async () => {
      await mediaPrisma.$disconnect()
      await pub.stop()
    },
  }
}
