import { existsSync } from 'node:fs'
import { Queue, Worker } from 'bullmq'
import type IORedis from 'ioredis'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRedisConnection } from './redis'
import { syncJobSchedulers } from './schedulers'

// Docker 가 없는 환경(로컬 도구·제한된 CI)에서는 실패가 아니라 skip. 소켓/DOCKER_HOST 로만
// 판단한다 — `docker info` 를 부르면 skip 판단 자체가 수 초 걸린다.
const dockerAvailable = existsSync('/var/run/docker.sock') || !!process.env.DOCKER_HOST

let container: StartedTestContainer
let url: string
const connections: IORedis[] = []

function connect(): IORedis {
  const c = createRedisConnection(url)
  connections.push(c)
  return c
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition')
    await sleep(25)
  }
}

// 각 테스트가 자기 큐 이름을 써서 서로의 잡·스케줄러를 보지 않게 한다.
let queueCounter = 0
const nextQueueName = (): string => `test-queue-${process.pid}-${++queueCounter}`

describe.skipIf(!dockerAvailable)('bullmq against a real broker', () => {
  beforeAll(async () => {
    // 프로덕션과 같은 이미지(compose 의 valkey/valkey:9-alpine).
    container = await new GenericContainer('valkey/valkey:9-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start()
    url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`
  }, 180_000)

  afterEach(async () => {
    await Promise.allSettled(connections.splice(0).map((c) => c.quit()))
  })

  afterAll(async () => {
    await container?.stop()
  })

  it('enqueue 한 잡을 워커가 familyId 페이로드 그대로 받는다', async () => {
    const name = nextQueueName()
    const queue = new Queue(name, { connection: connect() })
    const seen: unknown[] = []
    const worker = new Worker(
      name,
      async (job) => {
        seen.push(job.data)
      },
      { connection: connect() },
    )
    await queue.add('asset.uploaded', { familyId: 'fam-1', assetId: 'asset-1' })
    await waitFor(() => seen.length === 1)
    expect(seen[0]).toEqual({ familyId: 'fam-1', assetId: 'asset-1' })
    await worker.close()
    await queue.close()
  })

  it('delay 를 준 잡은 그 시간이 지난 뒤에 실행된다', async () => {
    const name = nextQueueName()
    const queue = new Queue(name, { connection: connect() })
    const enqueuedAt = Date.now()
    let ranAt = 0
    const worker = new Worker(
      name,
      async () => {
        ranAt = Date.now()
      },
      { connection: connect() },
    )
    await queue.add('deferred', { familyId: 'fam-1' }, { delay: 700 })
    await waitFor(() => ranAt > 0)
    expect(ranAt - enqueuedAt).toBeGreaterThanOrEqual(650)
    await worker.close()
    await queue.close()
  })

  it('syncJobSchedulers 로 등록한 스케줄러가 실제로 잡을 낸다', async () => {
    const name = nextQueueName()
    const queue = new Queue(name, { connection: connect() })
    const ran: string[] = []
    const worker = new Worker(
      name,
      async (job) => {
        ran.push(job.name)
      },
      { connection: connect() },
    )
    // 매초 — 스케줄러가 살아 있는지 몇 초 안에 확인하려고. 프로덕션 패턴은 분/시 단위다.
    await syncJobSchedulers(queue, [
      { id: 'tick', pattern: '* * * * * *', opts: { removeOnComplete: true } },
    ])
    await waitFor(() => ran.length >= 1)
    expect(ran[0]).toBe('tick')
    const schedulers = await queue.getJobSchedulers()
    expect(schedulers.map((s) => s.key)).toEqual(['tick'])
    await worker.close()
    await queue.close()
  })

  it('선언에서 빠진 스케줄러와 구버전 repeatable 키를 함께 걷어낸다', async () => {
    const name = nextQueueName()
    const client = connect()
    const queue = new Queue(name, { connection: connect() })
    await syncJobSchedulers(queue, [
      { id: 'keep', pattern: '0 9 * * *' },
      { id: 'drop', pattern: '0 10 * * *' },
    ])
    // bullmq 5 가 `repeat: { pattern }` 으로 남긴 레거시 항목 — 같은 zset 에 md5 키로 들어
    // 있고, v6 에는 이걸 지울 전용 API 가 없다. 살아 있는 인스턴스의 Redis 를 재현한다.
    const legacyKey = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    await client.zadd(`bull:${name}:repeat`, Date.now() + 60_000, legacyKey)
    await client.hset(`bull:${name}:repeat:${legacyKey}`, {
      name: 'memories-scan',
      pattern: '0 9 * * *',
    })

    const result = await syncJobSchedulers(queue, [{ id: 'keep', pattern: '0 9 * * *' }])

    expect(result.removed.sort()).toEqual([legacyKey, 'drop'].sort())
    const remaining = await queue.getJobSchedulers()
    expect(remaining.map((s) => s.key)).toEqual(['keep'])
    expect(await client.exists(`bull:${name}:repeat:${legacyKey}`)).toBe(0)
    await queue.close()
  })

  it('close() 는 처리 중인 잡을 끝낸 뒤에 돌아온다', async () => {
    const name = nextQueueName()
    const queue = new Queue(name, { connection: connect() })
    let started = false
    let finished = false
    const worker = new Worker(
      name,
      async () => {
        started = true
        await sleep(1_000)
        finished = true
      },
      { connection: connect() },
    )
    await queue.add('slow', { familyId: 'fam-1' })
    await waitFor(() => started)
    expect(finished).toBe(false)
    await worker.close()
    expect(finished).toBe(true)
    expect(await queue.getJobCountByTypes('completed')).toBe(1)
    await queue.close()
  })
})
