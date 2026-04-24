import { PrismaClient as PrismaMedia } from '@bebe/db-media'
import { startTestDb as startPublicDb } from '@bebe/db-public'

export type FullTestDb = {
  url: string
  prismaPublic: Awaited<ReturnType<typeof startPublicDb>>['prisma']
  prismaMedia: PrismaMedia
  stop: () => Promise<void>
}

export async function startFullTestDb(): Promise<FullTestDb> {
  const pub = await startPublicDb()
  const mediaPrisma = new PrismaMedia({ datasources: { db: { url: pub.url } } })
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
