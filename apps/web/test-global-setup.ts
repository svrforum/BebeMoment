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
  process.env.BEBE_TEST_PG_URL = container.getConnectionUri()
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop()
    container = null
  }
}
