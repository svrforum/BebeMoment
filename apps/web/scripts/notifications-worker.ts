import { prismaPublic } from '@/lib/db-init'
import { ensureVapidKeys } from '@/server/notifications/vapid'
import { handleNotificationJob } from '@/server/notifications/worker'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import { NOTIFICATIONS_QUEUE, type NotificationJob } from '@bebe/core'
import { type Job, Worker } from 'bullmq'
import IORedis from 'ioredis'
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

async function main(): Promise<void> {
  const keys = await ensureVapidKeys({ get: settingsGet, set: settingsSet })
  const contact = `mailto:${process.env.ADMIN_USER_EMAIL?.split(',')[0] ?? 'admin@bebe.local'}`
  webpush.setVapidDetails(contact, keys.publicKey, keys.privateKey)

  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })

  const worker = new Worker<NotificationJob>(
    NOTIFICATIONS_QUEUE,
    async (job: Job<NotificationJob>) => {
      await handleNotificationJob(job.data, {
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
