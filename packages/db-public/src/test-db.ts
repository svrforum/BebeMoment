import { PrismaPg } from '@prisma/adapter-pg'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
// 상대 경로로 db-media 의 조각을 쓴다 — 패키지 의존(그리고 barrel)을 만들지 않으려고. 컨테이너를
// 띄우는 globalSetup 도 같은 곳에 있다(vitest.config.ts).
import { createDatabase, databaseUrl, runMigrations } from '../../db-media/src/test-pg'
import { PrismaClient } from '../prisma/generated/client/client'

export type TestDb = {
  prisma: PrismaClient
  url: string
  stop: () => Promise<void>
}

// 공유 컨테이너에 만든 DB 별로 카운터 — vitest fork (process) 단위로 격리.
let dbCounter = 0

/**
 * Postgres 위에 fresh database 를 만들고 @bebe/db-public → @bebe/db-media 순서로
 * 마이그레이션을 적용. 반환되는 prisma 는 public 스키마의 isolated client.
 *
 * BEBE_TEST_PG_URL env 가 있으면 (vitest globalSetup — @bebe/db-media 의 test-global-setup.ts
 * 가 띄운 컨테이너) 그 템플릿 DB 를 복제만 한다. 없으면 fallback 으로 자체 컨테이너를 띄우고
 * 마이그레이션을 직접 돌린다(스크립트·단독 실행 호환).
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

  const adapter = new PrismaPg({ connectionString: url }, { schema: 'public' })
  const prisma = new PrismaClient({ adapter })
  return {
    prisma,
    url,
    stop: async () => {
      await prisma.$disconnect()
      // 공유 컨테이너면 stop 안 함(globalSetup teardown 이 정리). 자체 컨테이너면
      // 정리. 생성한 DB 는 컨테이너 stop 때 함께 사라지므로 별도 DROP 불필요.
      if (ownContainer) await ownContainer.stop()
    },
  }
}
