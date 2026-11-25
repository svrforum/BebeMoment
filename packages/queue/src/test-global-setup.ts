import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'

/**
 * vitest globalSetup — 테스트 실행마다 전용 valkey 컨테이너를 띄우고 REDIS_URL 을 그쪽으로
 * **덮어쓴다**(셸에 남은 값도 무시). 테스트가 만드는 BullMQ 큐·잡이 개발 머신의 다른 Redis
 * (운영일 수도 있다)에 닿지 않게 하는 게 목적이다. worker fork 는 이 뒤에 만들어져 값을 물려받는다.
 *
 * 패키지 barrel 에서 재수출하지 않는다 — testcontainers 가 앱 번들에 끌려 들어간다.
 */
let container: StartedTestContainer | null = null

export async function setup(): Promise<void> {
  // 운영 compose 와 같은 이미지.
  container = await new GenericContainer('valkey/valkey:9-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
    .start()
  process.env.REDIS_URL = `redis://${container.getHost()}:${container.getMappedPort(6379)}`
}

export async function teardown(): Promise<void> {
  await container?.stop()
  container = null
}
