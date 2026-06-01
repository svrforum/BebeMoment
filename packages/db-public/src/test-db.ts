import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client as PgClient } from 'pg'
import { PrismaClient } from '../prisma/generated/client/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

export type TestDb = {
  prisma: PrismaClient
  url: string
  stop: () => Promise<void>
}

function runMigrations(pkg: string, databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--filter', pkg, 'exec', 'prisma', 'migrate', 'deploy'], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`[${pkg}] prisma migrate deploy exit ${code}`)),
    )
    child.on('error', reject)
  })
}

// 공유 컨테이너에 만든 DB 별로 카운터 — vitest fork (process) 단위로 격리.
let dbCounter = 0

function buildUrl(baseUrl: string, dbName: string): string {
  // postgres://user:pass@host:port/<dbName> 형태로 부모 컨테이너의 DB 만 갈아끼움.
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

async function createDatabase(baseUrl: string, dbName: string): Promise<void> {
  const client = new PgClient({ connectionString: baseUrl })
  await client.connect()
  try {
    // CREATE DATABASE 는 트랜잭션 밖에서만 가능. dbName 은 pid + counter 라 SQL
    // injection 위험 없음 (식별자 quote 만 적용).
    await client.query(`CREATE DATABASE "${dbName}"`)
  } finally {
    await client.end()
  }
}

/**
 * Postgres 위에 fresh database 를 만들고 @bebe/db-public → @bebe/db-media 순서로
 * 마이그레이션을 적용. 반환되는 prisma 는 public 스키마의 isolated client.
 *
 * BEBE_TEST_PG_URL env 가 있으면 (vitest globalSetup 이 띄운 컨테이너) 그 위에
 * CREATE DATABASE 만 — 컨테이너 spin-up 비용 절약. 없으면 fallback 으로 자체
 * 컨테이너를 띄움(스크립트·단독 실행 호환).
 */
export async function startTestDb(): Promise<TestDb> {
  const sharedBaseUrl = process.env.BEBE_TEST_PG_URL
  let ownContainer: StartedPostgreSqlContainer | null = null
  let baseUrl: string
  if (sharedBaseUrl) {
    baseUrl = sharedBaseUrl
  } else {
    ownContainer = await new PostgreSqlContainer('pgvector/pgvector:pg16')
      .withDatabase('bebe')
      .withUsername('bebe')
      .withPassword('bebe')
      .start()
    baseUrl = ownContainer.getConnectionUri()
  }

  const dbName = `bebe_${process.pid}_${++dbCounter}`
  await createDatabase(baseUrl, dbName)
  const url = buildUrl(baseUrl, dbName)

  await runMigrations('@bebe/db-public', url)
  await runMigrations('@bebe/db-media', url)

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
