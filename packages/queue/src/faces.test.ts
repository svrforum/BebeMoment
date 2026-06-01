import type { FaceDetectJob } from '@bebe/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { add } = vi.hoisted(() => ({ add: vi.fn() }))
vi.mock('bullmq', () => ({
  Queue: class {
    add = add
  },
}))
vi.mock('./redis', () => ({ createRedisConnection: vi.fn(() => ({})) }))

import { enqueueFaceDetect } from './faces'

const job: FaceDetectJob = { type: 'face-detect', familyId: 'fam-1', assetId: 'asset-1' }

beforeEach(() => add.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('enqueueFaceDetect', () => {
  it('잡 타입·페이로드와 재시도/정리 옵션을 함께 넘긴다', async () => {
    await enqueueFaceDetect(job)
    expect(add).toHaveBeenCalledWith(
      'face-detect',
      job,
      expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      }),
    )
  })

  it('ML 사이드카 잡이 유실되지 않게 재시도를 1회 이상 건다', async () => {
    await enqueueFaceDetect(job)
    const opts = add.mock.calls[0]?.[2] as { attempts: number }
    expect(opts.attempts).toBeGreaterThanOrEqual(1)
  })

  it('enqueue 실패(예: Redis 다운)해도 throw 하지 않는다', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    add.mockRejectedValueOnce(new Error('redis down'))
    await expect(enqueueFaceDetect(job)).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
  })
})
