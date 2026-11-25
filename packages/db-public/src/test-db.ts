import { PrismaPg } from '@prisma/adapter-pg'
// 상대 경로로 db-media 의 조각을 쓴다 — 패키지 의존(그리고 barrel)을 만들지 않으려고. 컨테이너를
// 띄우는 globalSetup 도 같은 곳에 있다(vitest.config.ts).
import { createTestDatabase } from '../../db-media/src/test-pg'
import { PrismaClient } from '../prisma/generated/client/client'

export type TestDb = {
  prisma: PrismaClient
  url: string
  stop: () => Promise<void>
}

/**
 * public·media 마이그레이션이 다 적용된 새 database(createTestDatabase). 반환되는 prisma 는 public
 * 스키마의 isolated client(tenant 확장 없음).
 */
export async function startTestDb(): Promise<TestDb> {
  const db = await createTestDatabase()
  const adapter = new PrismaPg({ connectionString: db.url }, { schema: 'public' })
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
