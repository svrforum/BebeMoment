import { PrismaPg } from '@prisma/adapter-pg'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaClient } from '../prisma/generated/client/client'
import { createDatabase, databaseUrl, runMigrations } from './test-pg'

export type TestDb = {
  prisma: PrismaClient
  url: string
  stop: () => Promise<void>
}

let dbCounter = 0

/**
 * public·media 마이그레이션이 다 적용된 새 database. 반환되는 prisma 는 media 스키마의
 * isolated client(tenant 확장 없음).
 *
 * vitest globalSetup(test-global-setup.ts)이 띄운 컨테이너가 있으면(BEBE_TEST_PG_URL) 그 템플릿을
 * 복제만 한다. 없으면 자체 컨테이너를 띄우고 마이그레이션을 직접 돌린다(스크립트·단독 실행 호환).
 */
export async function startTestDb(): Promise<TestDb> {
  const sharedBaseUrl = process.env.BEBE_TEST_PG_URL
  const template = sharedBaseUrl ? process.env.BEBE_TEST_PG_TEMPLATE : undefined
  let ownContainer: StartedPostgreSqlContainer | null = null
  let baseUrl: string
  if (sharedBaseUrl) {
    baseUrl = sharedBaseUrl
  } else {
    ownContainer = await new PostgreSqlContainer('pgvector/pgvector:pg17')
      .withDatabase('bebe')
      .withUsername('bebe')
      .withPassword('bebe')
      .start()
    baseUrl = ownContainer.getConnectionUri()
  }

  const dbName = `bebe_${process.pid}_${++dbCounter}`
  await createDatabase(baseUrl, dbName, template)
  const url = databaseUrl(baseUrl, dbName)

  if (!template) {
    await runMigrations('@bebe/db-public', url)
    await runMigrations('@bebe/db-media', url)
  }

  const adapter = new PrismaPg({ connectionString: url }, { schema: 'media' })
  const prisma = new PrismaClient({ adapter })
  return {
    prisma,
    url,
    stop: async () => {
      await prisma.$disconnect()
      if (ownContainer) await ownContainer.stop()
    },
  }
}
