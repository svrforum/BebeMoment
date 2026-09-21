import type { NotificationJob } from '@bebe/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { add } = vi.hoisted(() => ({ add: vi.fn() }))
vi.mock('bullmq', () => ({
  Queue: class {
    add = add
  },
}))
vi.mock('./redis', () => ({ createRedisConnection: vi.fn(() => ({})) }))

import { enqueueNotification, enqueueNotificationOrThrow } from './notifications'

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

  it('실패를 알려야 하는 호출자는 throw 하는 변형을 쓴다', async () => {
    // 일정 알림 틱은 보내기 전에 발송 원장을 '보냄'으로 선점한다 — enqueue 실패를 삼키면
    // 그 회차가 영영 재시도되지 않으므로 실패가 호출자에게 닿아야 한다.
    add.mockRejectedValueOnce(new Error('redis down'))
    await expect(enqueueNotificationOrThrow(job)).rejects.toThrow('redis down')
  })

  it('enqueue 실패해도 throw 하지 않는다', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    add.mockRejectedValueOnce(new Error('redis down'))
    await expect(enqueueNotification(job)).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
  })
})
