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

let dbCounter = 0

function buildUrl(baseUrl: string, dbName: string): string {
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

async function createDatabase(baseUrl: string, dbName: string): Promise<void> {
  const client = new PgClient({ connectionString: baseUrl })
  await client.connect()
  try {
    await client.query(`CREATE DATABASE "${dbName}"`)
  } finally {
    await client.end()
  }
}

/**
 * Postgres 위에 fresh database 를 만들고 @bebe/db-public → @bebe/db-media 순서로
 * 마이그레이션을 적용. 반환되는 prisma 는 media 스키마의 isolated client.
 *
 * BEBE_TEST_PG_URL env (vitest globalSetup) 가 있으면 그 위에 CREATE DATABASE 만 —
 * 컨테이너 spin-up 비용 절약. 없으면 fallback 자체 컨테이너.
 */
export async function startTestDb(): Promise<TestDb> {
  const sharedBaseUrl = process.env.BEBE_TEST_PG_URL
  let ownContainer: StartedPostgreSqlContainer | null = null
  let baseUrl: string
  if (sharedBaseUrl) {
    baseUrl = sharedBaseUrl
  } else {
    ownContainer = await new PostgreSqlContainer('postgres:16-alpine')
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
