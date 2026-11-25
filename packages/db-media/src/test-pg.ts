import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client as PgClient } from 'pg'

// 테스트 DB 를 만드는 저수준 조각들. test-db.ts 와 test-global-setup.ts 가 같이 쓴다.
// barrel 에서 재수출하지 않는다(테스트 전용).

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
