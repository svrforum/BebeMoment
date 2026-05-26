import { expect, it, vi } from 'vitest'
import { handleNotificationJob } from './worker'

it('마스터 off 면 발송 안 함', async () => {
  const send = vi.fn()
  await handleNotificationJob(
    { familyId: 'f', actorUserId: 'a', type: 'album.asset_added', payload: { albumId: 'al' } },
    {
      settingsGet: async () => 'false',
      loadFamily: async () => ({ members: [], visibility: 'family' }),
      prefEnabled: async () => true,
      subscriptionsFor: async () => [],
      send,
      deleteSub: async () => {},
    },
  )
  expect(send).not.toHaveBeenCalled()
})

it('게이트 통과 시 수신자 구독에 발송, 410 구독 삭제', async () => {
  const send = vi.fn(async (sub: { endpoint: string }) => {
    if (sub.endpoint === 'dead') {
      // biome-ignore lint/suspicious/noExplicitAny: test error shaping
      const e: any = new Error('gone')
      e.statusCode = 410
      throw e
    }
  })
  const deleteSub = vi.fn()
  await handleNotificationJob(
    { familyId: 'f', actorUserId: 'a', type: 'album.asset_added', payload: { albumId: 'al' } },
    {
      settingsGet: async (k) => (k === 'push.enabled' ? 'true' : 'true'),
      loadFamily: async () => ({
        members: [{ userId: 'b', role: 'family' }],
        visibility: 'family',
      }),
      prefEnabled: async () => true,
      subscriptionsFor: async () => [
        { endpoint: 'ok', p256dh: 'x', auth: 'y', userId: 'b' },
        { endpoint: 'dead', p256dh: 'x', auth: 'y', userId: 'b' },
      ],
      send,
      deleteSub,
    },
  )
  expect(send).toHaveBeenCalledTimes(2)
  expect(deleteSub).toHaveBeenCalledWith('dead')
})
