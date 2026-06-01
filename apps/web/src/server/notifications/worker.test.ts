import { expect, it, vi } from 'vitest'
import { buildNotification, handleNotificationJob } from './worker'

it('digest.summary 는 사진과 기타 소식을 합산해 보여준다', () => {
  const base = { familyId: 'f', actorUserId: '', type: 'digest.summary' as const }
  expect(buildNotification({ ...base, payload: { photos: '3', others: '2' } }).body).toBe(
    '새 사진 3장과 새 소식 2개가 있어요',
  )
  expect(buildNotification({ ...base, payload: { photos: '3', others: '0' } }).body).toBe(
    '새 사진 3장이 올라왔어요',
  )
  expect(buildNotification({ ...base, payload: { photos: '0', others: '2' } }).body).toBe(
    '새 소식 2개가 있어요',
  )
})

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

it('FCM 디바이스 토큰에도 발송, expired 토큰 삭제', async () => {
  const sendFcm = vi.fn(
    async (token: string): Promise<'ok' | 'expired' | 'error'> =>
      token === 'gone' ? 'expired' : 'ok',
  )
  const deleteDeviceToken = vi.fn()
  await handleNotificationJob(
    { familyId: 'f', actorUserId: 'a', type: 'album.asset_added', payload: { albumId: 'al' } },
    {
      settingsGet: async () => 'true',
      loadFamily: async () => ({
        members: [{ userId: 'b', role: 'family' }],
        visibility: 'family',
      }),
      prefEnabled: async () => true,
      subscriptionsFor: async () => [],
      send: vi.fn(),
      deleteSub: vi.fn(),
      deviceTokensFor: async () => [
        { token: 'live', userId: 'b' },
        { token: 'gone', userId: 'b' },
      ],
      sendFcm,
      deleteDeviceToken,
    },
  )
  expect(sendFcm).toHaveBeenCalledTimes(2)
  expect(deleteDeviceToken).toHaveBeenCalledWith({ userId: 'b', token: 'gone' })
  expect(deleteDeviceToken).toHaveBeenCalledTimes(1)
})

it('FCM 미설정(deps 없음)이면 FCM 발송 시도 안 함', async () => {
  const send = vi.fn()
  await handleNotificationJob(
    { familyId: 'f', actorUserId: 'a', type: 'album.asset_added', payload: { albumId: 'al' } },
    {
      settingsGet: async () => 'true',
      loadFamily: async () => ({
        members: [{ userId: 'b', role: 'family' }],
        visibility: 'family',
      }),
      prefEnabled: async () => true,
      subscriptionsFor: async () => [],
      send,
      deleteSub: vi.fn(),
    },
  )
  // No FCM deps provided → no throw, job completes.
  expect(send).not.toHaveBeenCalled()
})
