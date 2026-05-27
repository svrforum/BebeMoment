import { decryptSecret } from '@/lib/crypto'
import { prismaPublic } from '@/lib/db-init'
import { deleteDeviceToken, listDeviceTokensForUsers } from '@/server/notifications/device-tokens'
import {
  type FcmServiceAccount,
  getFcmAccessToken,
  parseServiceAccount,
  sendFcm,
} from '@/server/notifications/fcm'
import { ensureVapidKeys } from '@/server/notifications/vapid'
import { handleNotificationJob } from '@/server/notifications/worker'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NOTIFICATIONS_QUEUE, type NotificationJob } from '@bebe/core'
import { createRedisConnection } from '@bebe/queue'
import { type Job, Worker } from 'bullmq'
import webpush from 'web-push'
import { z } from 'zod'

const stringSetting = z.string()

async function settingsGet(key: string): Promise<string | null> {
  return getSetting(key, stringSetting.nullable(), null, prismaPublic)
}

async function settingsSet(key: string, value: string): Promise<void> {
  await setSetting(key, value, null, prismaPublic)
}

type Role = 'owner' | 'guardian' | 'family'

type FcmDeps = {
  deviceTokensFor: (userIds: string[]) => Promise<{ token: string; userId: string }[]>
  sendFcm: (
    token: string,
    payload: { title: string; body: string; url: string },
  ) => Promise<'ok' | 'expired' | 'error'>
  deleteDeviceToken: (input: { userId: string; token: string }) => Promise<void>
}

// OAuth access token is cached across jobs (~50min TTL); re-minted on expiry or
// when the service account's client_email changes.
let fcmTokenCache: { token: string; exp: number; clientEmail: string } | null = null

async function buildFcmDeps(): Promise<FcmDeps | null> {
  if ((await settingsGet('push.fcm.enabled')) !== 'true') return null
  const enc = await settingsGet('push.fcm_service_account')
  if (!enc) return null
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) return null
  let sa: FcmServiceAccount | null = null
  try {
    sa = parseServiceAccount(await decryptSecret(enc, secretKey))
  } catch {
    return null
  }
  if (!sa) return null
  const account = sa

  async function accessToken(): Promise<string> {
    const now = Date.now()
    if (
      fcmTokenCache &&
      fcmTokenCache.exp > now &&
      fcmTokenCache.clientEmail === account.clientEmail
    ) {
      return fcmTokenCache.token
    }
    const token = await getFcmAccessToken(account)
    fcmTokenCache = { token, exp: now + 50 * 60 * 1000, clientEmail: account.clientEmail }
    return token
  }

  return {
    deviceTokensFor: (userIds) => listDeviceTokensForUsers(userIds, prismaPublic),
    sendFcm: async (token, payload) =>
      sendFcm(token, payload, account.projectId, await accessToken()),
    deleteDeviceToken: (input) => deleteDeviceToken(input, prismaPublic),
  }
}

async function main(): Promise<void> {
  const keys = await ensureVapidKeys({ get: settingsGet, set: settingsSet })
  const contact = `mailto:${process.env.ADMIN_USER_EMAIL?.split(',')[0] ?? 'admin@bebe.local'}`
  webpush.setVapidDetails(contact, keys.publicKey, keys.privateKey)

  const connection = createRedisConnection()

  const worker = new Worker<NotificationJob>(
    NOTIFICATIONS_QUEUE,
    async (job: Job<NotificationJob>) => {
      const fcm = await buildFcmDeps()
      await handleNotificationJob(job.data, {
        ...(fcm ?? {}),
        settingsGet,
        loadFamily: async (familyId) => {
          const rows = await prismaPublic.membership.findMany({
            where: { familyId },
            select: { userId: true, role: true },
          })
          const visibility = job.data.payload.visibility === 'guardians' ? 'guardians' : 'family'
          return {
            members: rows.map((r) => ({ userId: r.userId, role: r.role as Role })),
            visibility,
          }
        },
        prefEnabled: async (userId, category) => {
          const pref = await prismaPublic.notificationPref.findUnique({
            where: { userId_category: { userId, category } },
          })
          return pref?.enabled ?? true
        },
        subscriptionsFor: async (userIds) =>
          prismaPublic.pushSubscription.findMany({ where: { userId: { in: userIds } } }),
        send: (sub, payload) =>
          webpush
            .sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            )
            .then(() => undefined),
        deleteSub: async (endpoint) => {
          await prismaPublic.pushSubscription.deleteMany({ where: { endpoint } })
        },
      })
    },
    { connection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[notifications-worker] job ${job?.id} failed:`, err)
  })

  console.log('[notifications-worker] started')
}

void main()
