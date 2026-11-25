import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createDatabase, databaseUrl, execSql, runMigrations } from './test-pg'

/**
 * vitest globalSetup — 테스트 실행 하나에 Postgres 컨테이너 하나. web·media·db 패키지가 같이 쓴다.
 *
 * 마이그레이션(public → media)은 여기서 템플릿 DB 에 **한 번만** 돌리고, 각 테스트 파일의
 * startTestDb() 는 `CREATE DATABASE … TEMPLATE` 으로 복제만 한다. 파일마다 prisma CLI 를 두 번씩
 * 띄우던 비용이 사라지고, 여러 DB 가 동시에 bebe_roles 마이그레이션(CREATE ROLE 은 클러스터
 * 전역)을 돌려 P3018 로 부딪치던 경합도 없어진다.
 *
 * 값은 env 로 넘긴다 — worker fork 는 globalSetup 이 끝난 뒤 이 프로세스의 env 를 물려받는다.
 * 패키지 barrel 에서 재수출하지 않는다(testcontainers 가 앱 번들에 끌려 들어간다).
 */
const TEMPLATE_DB = 'bebe_template'

let container: StartedPostgreSqlContainer | null = null

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg17')
    .withDatabase('bebe')
    .withUsername('bebe')
    .withPassword('bebe')
    .start()
  const baseUrl = container.getConnectionUri()

  await createDatabase(baseUrl, TEMPLATE_DB)
  const templateUrl = databaseUrl(baseUrl, TEMPLATE_DB)
  await runMigrations('@bebe/db-public', templateUrl)
  await runMigrations('@bebe/db-media', templateUrl)
  // 원본에 누가 접속해 있으면 복제가 'being accessed by other users' 로 실패한다 — 잠가 둔다.
  await execSql(baseUrl, `ALTER DATABASE "${TEMPLATE_DB}" WITH ALLOW_CONNECTIONS false`)

  process.env.BEBE_TEST_PG_URL = baseUrl
  process.env.BEBE_TEST_PG_TEMPLATE = TEMPLATE_DB
}

export async function teardown(): Promise<void> {
  await container?.stop()
  container = null
}
