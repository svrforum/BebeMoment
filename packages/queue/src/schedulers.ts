import type { JobSchedulerTemplateOptions, Queue } from 'bullmq'

export type JobSchedulerSpec = {
  /** 스케줄러 id. 생성되는 잡의 이름으로도 쓴다 — 워커가 job.name 으로 분기한다. */
  id: string
  /** cron 표현식. tz 를 주지 않으므로 컨테이너 로컬시각 기준이다(TZ env, §16). */
  pattern: string
  data?: Record<string, unknown>
  opts?: JobSchedulerTemplateOptions
}

export type SchedulerQueue = Pick<
  Queue,
  'upsertJobScheduler' | 'getJobSchedulers' | 'removeJobScheduler'
>

/**
 * 큐의 반복 잡을 spec 그대로 맞춘다 — spec 을 upsert 하고, 같은 큐에 남아 있는 그 밖의
 * 항목은 지운다.
 *
 * bullmq 는 레거시 repeatable(v5 의 `repeat` 옵션)과 job scheduler 를 같은 zset
 * (`<prefix>:<queue>:repeat`)에 담는다. 둘이 공존하면 같은 크론이 두 번 돌고, bullmq 6 은
 * 레거시 항목을 더 이상 진행시키지 못해 스케줄이 조용히 사라진다(§2#6 조용한 실패 금지).
 * 그래서 선언한 spec 밖의 항목은 전부 걷어낸다 — removeJobScheduler 는 레거시 키에도
 * 동작한다(같은 zset 멤버와 `repeat:<key>:<millis>` 예약 잡을 함께 지우는 스크립트라,
 * jobId 로 등록한 우리 레거시 항목과 키 모양이 같다).
 */
export async function syncJobSchedulers(
  queue: SchedulerQueue,
  specs: readonly JobSchedulerSpec[],
): Promise<{ upserted: string[]; removed: string[] }> {
  for (const spec of specs) {
    await queue.upsertJobScheduler(
      spec.id,
      { pattern: spec.pattern },
      { name: spec.id, data: spec.data ?? {}, ...(spec.opts ? { opts: spec.opts } : {}) },
    )
  }
  const keep = new Set(specs.map((s) => s.id))
  const removed: string[] = []
  // 레거시 항목은 디코드가 실패해 undefined 로 올 수 있다(zset 에 고아 멤버만 남은 경우) —
  // Redis 에서 읽어오는 남의 상태라 경계에서 방어한다.
  for (const existing of await queue.getJobSchedulers()) {
    const key = existing?.key
    if (!key || keep.has(key)) continue
    await queue.removeJobScheduler(key)
    removed.push(key)
  }
  return { upserted: specs.map((s) => s.id), removed }
}
