import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaClient } from '../prisma/generated/client'

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

/**
 * Fresh Postgres 컨테이너를 띄우고 @bebe/db-public → @bebe/db-media 순서로
 * 마이그레이션을 적용하여 public + media 스키마 모두 생성. 반환되는 prisma 는
 * db-media 의 isolated client (media 스키마만 노출).
 */
export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('bebe')
    .withUsername('bebe')
    .withPassword('bebe')
    .start()

  const url = container.getConnectionUri()
  await runMigrations('@bebe/db-public', url)
  await runMigrations('@bebe/db-media', url)

  const prisma = new PrismaClient({ datasources: { db: { url } } })
  return {
    prisma,
    url,
    stop: async () => {
      await prisma.$disconnect()
      await container.stop()
    },
  }
}
