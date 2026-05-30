import { decryptSecret } from '@/lib/crypto'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listMemories } from '@/server/memories/list'
import { decideMemoryPush } from '@/server/memories/scan'
import { deleteDeviceToken, listDeviceTokensForUsers } from '@/server/notifications/device-tokens'
import { enqueueNotification } from '@/server/notifications/enqueue'
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
import { type Job, Queue, Worker } from 'bullmq'
import webpush from 'web-push'
import { z } from 'zod'

const stringSetting = z.string()
const MEMORIES_SCAN_JOB = 'memories-scan'

async function settingsGet(key: string): Promise<string | null> {
  return getSetting(key, stringSetting.nullable(), null, prismaPublic)
}

async function settingsSet(key: string, value: string): Promise<void> {
  await setSetting(key, value, null, prismaPublic)
}

/**
 * 매일 1회 — 가족별 오늘 추억을 스캔해 연 단위(항상)·월 단위(주1회 무작위) 푸시를
 * enqueue. enqueue 된 잡은 같은 워커가 일반 알림처럼 처리(카테고리 'memory' 게이트
 * 통과 시 발송). 마지막 발송일은 settings 에 기록해 중복·throttle 관리.
 */
async function runMemoriesScan(): Promise<void> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const families = await prismaPublic.family.findMany({ select: { id: true } })
  for (const fam of families) {
    // 카운트는 family-가시 기준(전체 멤버 대상 발송이라 숨김 콘텐츠 수 노출 방지).
    const groups = await listMemories(
      { familyId: fam.id, today, viewerRole: 'family' },
      prismaMedia,
      prismaPublic,
      getMediaClient(),
    )
    const lastYearly = await settingsGet(`memory.last_yearly.${fam.id}`)
    const lastMonthly = await settingsGet(`memory.last_monthly.${fam.id}`)
    const decision = decideMemoryPush({ today, groups, lastYearly, lastMonthly })

    if (decision.yearly) {
      await enqueueNotification({
        familyId: fam.id,
        actorUserId: '',
        type: 'memory.yearly',
        payload: {
          count: String(decision.yearly.count),
          interval: decision.yearly.interval,
          visibility: 'family',
        },
      })
      await settingsSet(`memory.last_yearly.${fam.id}`, todayStr)
    }
    if (decision.monthly) {
      await enqueueNotification({
        familyId: fam.id,
        actorUserId: '',
        type: 'memory.monthly',
        payload: {
          count: String(decision.monthly.count),
          interval: decision.monthly.interval,
          visibility: 'family',
        },
      })
      await settingsSet(`memory.last_monthly.${fam.id}`, todayStr)
    }
  }
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

// OAuth access token is cached across jobs (TTL from OAuth `expires_in` minus a
// 300s safety margin); re-minted on expiry or when the service account's
// client_email changes. `pendingToken` dedupes the cold-start stampede when
// many sendFcm calls fire concurrently with no live cache.
let fcmTokenCache: { token: string; exp: number; clientEmail: string } | null = null
let pendingToken: Promise<string> | null = null

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
    if (pendingToken) return pendingToken
    pendingToken = (async () => {
      try {
        const { token, expiresIn } = await getFcmAccessToken(account)
        const ttlMs = Math.max(expiresIn - 300, 60) * 1000
        fcmTokenCache = {
          token,
          exp: Date.now() + ttlMs,
          clientEmail: account.clientEmail,
        }
        return token
      } finally {
        pendingToken = null
      }
    })()
    return pendingToken
  }

  return {
    deviceTokensFor: (userIds) => listDeviceTokensForUsers(userIds, prismaPublic),
    sendFcm: async (token, payload) =>
      sendFcm(token, payload, account.projectId, await accessToken()),
    deleteDeviceToken: (input) => deleteDeviceToken(input, prismaPublic),
  }
}

async function main(): Promise<void> {
  const secretKey = process.env.SECRET_KEY
  if (!secretKey) throw new Error('SECRET_KEY required')
  const keys = await ensureVapidKeys({ get: settingsGet, set: settingsSet }, secretKey)
  const contact = `mailto:${process.env.ADMIN_USER_EMAIL?.split(',')[0] ?? 'admin@bebe.local'}`
  webpush.setVapidDetails(contact, keys.publicKey, keys.privateKey)

  const connection = createRedisConnection()

  const worker = new Worker<NotificationJob>(
    NOTIFICATIONS_QUEUE,
    async (job: Job<NotificationJob>) => {
      if (job.name === MEMORIES_SCAN_JOB) {
        await runMemoriesScan()
        return
      }
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
        prefsEnabledFor: async (userIds, category) => {
          if (userIds.length === 0) return new Set<string>()
          const rows = await prismaPublic.notificationPref.findMany({
            where: { userId: { in: userIds }, category },
            select: { userId: true, enabled: true },
          })
          const explicit = new Map(rows.map((r) => [r.userId, r.enabled]))
          // Default enabled=true when no row exists for the user.
          return new Set(userIds.filter((uid) => explicit.get(uid) ?? true))
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

  // 매일 09:00(서버 로컬) 추억 스캔 — 반복 작업 1개로 등록(jobId 고정 → 멱등).
  const queue = new Queue(NOTIFICATIONS_QUEUE, { connection })
  await queue.add(
    MEMORIES_SCAN_JOB,
    {},
    { repeat: { pattern: '0 9 * * *' }, jobId: MEMORIES_SCAN_JOB, removeOnComplete: true },
  )

  console.log('[notifications-worker] started')
}

void main()
