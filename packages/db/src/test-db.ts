import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

export type TestDb = {
  prisma: PrismaClient
  url: string
  stop: () => Promise<void>
}

function runMigrations(databaseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--filter', '@bebe/db', 'exec', 'prisma', 'migrate', 'deploy'], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`prisma migrate deploy exit ${code}`)),
    )
    child.on('error', reject)
  })
}

export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('bebe')
    .withUsername('bebe')
    .withPassword('bebe')
    .start()

  const url = container.getConnectionUri()
  await runMigrations(url)

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
