import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client as PgClient } from 'pg'

// 테스트 DB 를 만드는 조각들. 이 패키지의 test-db.ts·test-global-setup.ts 와 db-public 의
// test-db.ts(상대 경로)가 같이 쓴다. barrel 에서 재수출하지 않는다(테스트 전용).

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export function runMigrations(
  pkg: '@bebe/db-public' | '@bebe/db-media',
  databaseUrl: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--filter', pkg, 'exec', 'prisma', 'migrate', 'deploy'], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
    })
    // 성공하면 조용히 — 실행마다 수십 줄씩 찍히던 'Applying migration' 은 실패할 때만 보여 준다.
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      out += d
    })
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`[${pkg}] prisma migrate deploy exit ${code}\n${out}`)),
    )
    child.on('error', reject)
  })
}

/** postgres://user:pass@host:port/<db> 에서 DB 이름만 갈아끼운다. */
export function databaseUrl(baseUrl: string, dbName: string): string {
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

export async function execSql(url: string, sql: string): Promise<void> {
  const client = new PgClient({ connectionString: url })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

/**
 * CREATE DATABASE 는 트랜잭션 밖에서만 된다. 이름은 호출자가 pid·카운터로 만드는 값이라
 * 식별자 quote 만 한다. template 을 주면 그 DB 를 그대로 복제한다(마이그레이션 생략).
 */
export async function createDatabase(
  baseUrl: string,
  dbName: string,
  template?: string,
): Promise<void> {
  const from = template ? ` TEMPLATE "${template}"` : ''
  await execSql(baseUrl, `CREATE DATABASE "${dbName}"${from}`)
}

export type TestDatabase = {
  url: string
  /**
   * 자체 컨테이너를 띄웠을 때만 내린다. 공유 컨테이너는 globalSetup teardown 이 정리하고, 만든 DB 도
   * 그때 함께 사라진다.
   */
  stop: () => Promise<void>
}

// db-public·db-media 의 startTestDb 가 한 프로세스에서 함께 불려도 이름이 겹치지 않게 하나만 둔다.
let dbCounter = 0

/**
 * public·media 마이그레이션이 다 적용된 새 database. vitest globalSetup(test-global-setup.ts)이 띄운
 * 컨테이너가 있으면(BEBE_TEST_PG_URL) 그 템플릿을 복제만 한다. 없으면 자체 컨테이너를 띄우고
 * 마이그레이션을 직접 돌린다(스크립트·단독 실행 호환).
 */
export async function createTestDatabase(): Promise<TestDatabase> {
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

  return {
    url,
    stop: async () => {
      if (ownContainer) await ownContainer.stop()
    },
  }
}
