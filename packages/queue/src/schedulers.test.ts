import { describe, expect, it, vi } from 'vitest'
import { type SchedulerQueue, syncJobSchedulers } from './schedulers'

function fakeQueue(existing: Array<{ key: string; name: string } | undefined>): {
  queue: SchedulerQueue
  upsert: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
} {
  const upsert = vi.fn().mockResolvedValue(undefined)
  const remove = vi.fn().mockResolvedValue(true)
  const queue = {
    upsertJobScheduler: upsert,
    getJobSchedulers: vi.fn().mockResolvedValue(existing),
    removeJobScheduler: remove,
  } as unknown as SchedulerQueue
  return { queue, upsert, remove }
}

describe('syncJobSchedulers', () => {
  it('spec 을 id·이름·패턴 그대로 upsert 한다', async () => {
    const { queue, upsert } = fakeQueue([])
    await syncJobSchedulers(queue, [
      { id: 'memories-scan', pattern: '0 9 * * *', opts: { removeOnComplete: true } },
    ])
    expect(upsert).toHaveBeenCalledWith(
      'memories-scan',
      { pattern: '0 9 * * *' },
      { name: 'memories-scan', data: {}, opts: { removeOnComplete: true } },
    )
  })

  it('선언하지 않은 항목(구버전 repeatable 해시 키 포함)은 지운다', async () => {
    const { queue, remove } = fakeQueue([
      { key: 'memories-scan', name: 'memories-scan' },
      { key: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', name: 'digest-scan' },
    ])
    const result = await syncJobSchedulers(queue, [{ id: 'memories-scan', pattern: '0 9 * * *' }])
    expect(remove.mock.calls).toEqual([['a1b2c3d4e5f60718293a4b5c6d7e8f90']])
    expect(result.removed).toEqual(['a1b2c3d4e5f60718293a4b5c6d7e8f90'])
  })

  it('spec 이 비면 큐의 스케줄러를 모두 걷어낸다', async () => {
    const { queue, remove, upsert } = fakeQueue([{ key: 'stale', name: 'stale' }])
    await syncJobSchedulers(queue, [])
    expect(upsert).not.toHaveBeenCalled()
    expect(remove.mock.calls).toEqual([['stale']])
  })

  it('키를 못 읽는 고아 항목은 건너뛴다', async () => {
    const { queue, remove } = fakeQueue([undefined])
    await expect(syncJobSchedulers(queue, [])).resolves.toEqual({ upserted: [], removed: [] })
    expect(remove).not.toHaveBeenCalled()
  })
})
