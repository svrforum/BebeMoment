import { ensureTestRoles } from '@bebe/db-public/src/test-db'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

/**
 * vitest globalSetup — 메인 vitest 프로세스가 Postgres 컨테이너 1개를 띄우고
 * `BEBE_TEST_PG_URL` env 로 worker forks 에 전달. forks 는 spawn 시점에 부모 env
 * 를 상속하므로 모든 테스트가 같은 컨테이너에서 fresh database 를 만들어 쓴다.
 *
 * 이전: 테스트 파일마다 새 컨테이너(~2-3s) → 70 files × ~2.5s = ~3분 단순 시동 비용.
 * 지금: 컨테이너 1번 시동 + CREATE DATABASE (~50ms) × 70 = ~5초.
 *
 * 마이그레이션 spawn 은 여전히 파일당 비용이라 전체 절감폭은 컨테이너 시동분 한정.
 */
let container: StartedPostgreSqlContainer | null = null

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('pgvector/pgvector:pg17')
    .withDatabase('bebe')
    .withUsername('bebe')
    .withPassword('bebe')
    .start()
  const uri = container.getConnectionUri()
  process.env.BEBE_TEST_PG_URL = uri

  // db-media 의 bebe_roles 마이그레이션은 CREATE ROLE bebe_web/bebe_media(클러스터 전역)를
  // 한다. 공유 컨테이너에서 여러 테스트 DB 가 동시에 migrate deploy 하면 동시 CREATE ROLE 이
  // 충돌해 P3018 로 깨진다(병렬 테스트에서 산발적). 컨테이너 시동 직후 한 번 만들어 두면
  // 마이그레이션의 IF NOT EXISTS 가 항상 skip → 레이스 제거(결정적).
  await ensureTestRoles(uri)
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop()
    container = null
  }
}
