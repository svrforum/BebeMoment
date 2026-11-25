import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../prisma/generated/client/client'
import { createTestDatabase } from './test-pg'

export type TestDb = {
  prisma: PrismaClient
  url: string
  stop: () => Promise<void>
}

/**
 * public·media 마이그레이션이 다 적용된 새 database(createTestDatabase). 반환되는 prisma 는 media
 * 스키마의 isolated client(tenant 확장 없음).
 */
export async function startTestDb(): Promise<TestDb> {
  const db = await createTestDatabase()
  const adapter = new PrismaPg({ connectionString: db.url }, { schema: 'media' })
  const prisma = new PrismaClient({ adapter })
  return {
    prisma,
    url: db.url,
    stop: async () => {
      await prisma.$disconnect()
      await db.stop()
    },
  }
}
