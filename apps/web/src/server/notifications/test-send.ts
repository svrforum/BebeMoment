import { decryptSecret } from '@/lib/crypto'
import type { PrismaClient } from '@bebe/db-public'
import webpush from 'web-push'
import { deleteDeviceToken, listDeviceTokensForUsers } from './device-tokens'
import { getFcmAccessToken, parseServiceAccount, sendFcm } from './fcm'
import { ensureVapidKeys } from './vapid'

type Store = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
}

export type TestSendResult = {
  hasDevices: boolean
  web: { sent: number; failed: number; total: number }
  fcm: { sent: number; failed: number; total: number; enabled: boolean }
}

const TEST_PAYLOAD = {
  title: '베베 모먼트',
  body: '테스트 알림이 잘 도착했어요! 🎉',
  url: '/timeline',
}

/**
 * 로그인한 사용자가 자기 자신의 기기로 테스트 푸시를 쏜다 — "내 설정이 동작하나"
 * 확인용. 실제 알림 파이프라인(워커·수신자 해석)을 거치지 않고 본인 구독/토큰에
 * 직접 발송하므로 관리자 마스터·카테고리 게이트와 무관(연결 자체를 시험). 죽은
 * 구독(410/404)·만료 FCM 토큰은 발송 중 정리한다.
 */
export async function sendTestNotification(
  userId: string,
  prisma: PrismaClient,
  store: Store,
  secretKey: string,
): Promise<TestSendResult> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  let webSent = 0
  let webFailed = 0
  if (subs.length > 0) {
    const keys = await ensureVapidKeys(store, secretKey)
    const contact = `mailto:${process.env.ADMIN_USER_EMAIL?.split(',')[0] ?? 'admin@bebe.local'}`
    webpush.setVapidDetails(contact, keys.publicKey, keys.privateKey)
    const payload = JSON.stringify(TEST_PAYLOAD)
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        webSent++
      } catch (e) {
        webFailed++
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } })
        }
      }
    }
  }

  const fcmEnabled = (await store.get('push.fcm.enabled')) === 'true'
  const tokens = await listDeviceTokensForUsers([userId], prisma)
  let fcmSent = 0
  let fcmFailed = 0
  if (fcmEnabled && tokens.length > 0) {
    const enc = await store.get('push.fcm_service_account')
    const sa = enc ? parseServiceAccount(await decryptSecret(enc, secretKey)) : null
    if (sa) {
      const { token: accessToken } = await getFcmAccessToken(sa)
      for (const t of tokens) {
        const r = await sendFcm(t.token, TEST_PAYLOAD, sa.projectId, accessToken)
        if (r === 'ok') {
          fcmSent++
        } else {
          fcmFailed++
          if (r === 'expired') await deleteDeviceToken({ userId, token: t.token }, prisma)
        }
      }
    }
  }

  return {
    hasDevices: subs.length + tokens.length > 0,
    web: { sent: webSent, failed: webFailed, total: subs.length },
    fcm: { sent: fcmSent, failed: fcmFailed, total: tokens.length, enabled: fcmEnabled },
  }
}
