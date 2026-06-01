import type { NotificationJob } from '@bebe/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { add } = vi.hoisted(() => ({ add: vi.fn() }))
vi.mock('bullmq', () => ({
  Queue: class {
    add = add
  },
}))
vi.mock('./redis', () => ({ createRedisConnection: vi.fn(() => ({})) }))

import { enqueueNotification } from './notifications'

const job = {
  type: 'asset.uploaded',
  familyId: 'fam-1',
  actorUserId: 'user-1',
  payload: { assetId: 'asset-1' },
} as unknown as NotificationJob

beforeEach(() => add.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('enqueueNotification', () => {
  it('잡 타입·페이로드와 정리 옵션을 넘긴다', async () => {
    await enqueueNotification(job)
    expect(add).toHaveBeenCalledWith(
      'asset.uploaded',
      job,
      expect.objectContaining({ removeOnComplete: true, removeOnFail: 100 }),
    )
  })

  it('enqueue 실패해도 throw 하지 않는다', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    add.mockRejectedValueOnce(new Error('redis down'))
    await expect(enqueueNotification(job)).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
  })
})
