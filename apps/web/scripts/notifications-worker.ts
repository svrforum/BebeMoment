import { createHash } from 'node:crypto'
import { decryptSecret } from '@/lib/crypto'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { listMemories } from '@/server/memories/list'
import { decideMemoryPush } from '@/server/memories/scan'
import { deleteDeviceToken, listDeviceTokensForUsers } from '@/server/notifications/device-tokens'
import {
  DEFAULT_DELIVERY,
  type DeliverySettings,
  inQuietHours,
  isDigestSlot,
  shouldSendImmediate,
} from '@/server/notifications/digest'
import { enqueueNotification } from '@/server/notifications/enqueue'
import {
  type FcmServiceAccount,
  getFcmAccessToken,
  parseServiceAccount,
  sendFcm,
} from '@/server/notifications/fcm'
import { runScheduledBackupTick } from '@/server/backup/scheduled'
import { ensureVapidKeys } from '@/server/notifications/vapid'
import { handleNotificationJob } from '@/server/notifications/worker'
import { isFeatureEnabled } from '@/server/settings/features'
import { getSetting } from '@/server/settings/get'
import { setSetting } from '@/server/settings/set'
import {
  DEFAULT_FACE_CLUSTER_DISTANCE,
  FACE_CLUSTER_DISTANCE_MAX,
  FACE_CLUSTER_DISTANCE_MIN,
  NOTIFICATIONS_QUEUE,
  type NotificationJob,
  getPreset,
} from '@bebe/core'
import type { NotifContext } from '@/server/notifications/worker'
import { createRedisConnection, enqueueFaceDetect } from '@bebe/queue'
import { type Job, Queue, Worker } from 'bullmq'
import webpush from 'web-push'
import { z } from 'zod'

const stringSetting = z.string()
const MEMORIES_SCAN_JOB = 'memories-scan'
const BACKUP_TICK_JOB = 'backup-tick'
const TRASH_PURGE_JOB = 'trash-purge'

/**
 * 자동 휴지통 비우기 — retention.trash_days 를 넘긴 소프트삭제 자산을 영구 삭제한다.
 * media 가 바이트를 지워야 하므로 web 은 만료 자산 id 만 추려 media purge 라우트를
 * 호출한다(§17#10 경계). 가족별 스코프 쿼리로 tenant 미들웨어 통과. 0 이면 비활성.
 */
async function runTrashPurge(): Promise<void> {
  const days = await getSetting('retention.trash_days', z.number().finite(), 30, prismaPublic)
  if (days <= 0) return
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000)
  const families = await prismaPublic.family.findMany({ select: { id: true } })
  const media = getMediaClient()
  for (const fam of families) {
    const expired = await prismaMedia.asset.findMany({
      where: { familyId: fam.id, deletedAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    })
    for (const a of expired) {
      try {
        await media.purgeAsset(a.id, fam.id)
      } catch (e) {
        console.error('[trash-purge]', a.id, (e as Error).message)
      }
    }
  }
}

async function settingsGet(key: string): Promise<string | null> {
  return getSetting(key, stringSetting.nullable(), null, prismaPublic)
}

async function settingsSet(key: string, value: string): Promise<void> {
  await setSetting(key, value, null, prismaPublic)
}

/**
 * 푸시 문구용 컨텍스트 조회 — 제목엔 가족명, 본문엔 아기명·앨범명·마일스톤 항목·댓글 일부.
 * 모든 조회는 best-effort(실패해도 generic 문구로 폴백, 푸시는 계속).
 */
async function resolveNotifContext(job: NotificationJob): Promise<NotifContext> {
  const ctx: NotifContext = { familyName: '우리 가족' }
  try {
    const fam = await prismaPublic.family.findUnique({
      where: { id: job.familyId },
      select: { name: true },
    })
    if (fam?.name) ctx.familyName = fam.name
  } catch {}

  try {
    const p = job.payload
    if (job.type === 'comment.created' && p.commentId) {
      const c = await prismaPublic.assetComment.findUnique({
        where: { id: p.commentId },
        select: { body: true },
      })
      if (c?.body) ctx.commentSnippet = c.body.length > 30 ? `${c.body.slice(0, 30)}…` : c.body
    } else if (job.type === 'album.asset_added' && p.albumId) {
      const a = await prismaPublic.album.findUnique({
        where: { id: p.albumId },
        select: { name: true },
      })
      if (a?.name) ctx.albumName = a.name
    } else if ((job.type === 'growth.created' || job.type === 'milestone.created') && p.babyId) {
      const baby = await prismaPublic.baby.findFirst({
        where: { id: p.babyId, familyId: job.familyId },
        select: { name: true },
      })
      if (baby?.name) ctx.babyName = baby.name
      if (job.type === 'milestone.created' && p.milestoneId) {
        const m = await prismaPublic.milestone.findUnique({
          where: { id: p.milestoneId },
          select: { presetKey: true, customLabel: true },
        })
        const label = m?.customLabel || (m?.presetKey ? getPreset(m.presetKey)?.labelKo : undefined)
        if (label) ctx.milestoneLabel = label
      }
    }
  } catch {}
  return ctx
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

const DIGEST_SCAN_JOB = 'digest-scan'

async function readDeliverySettings(): Promise<DeliverySettings> {
  const num = async (key: string, def: number): Promise<number> => {
    const v = await settingsGet(key)
    const n = v ? Number(v) : Number.NaN
    return Number.isFinite(n) ? n : def
  }
  const mode = (await settingsGet('push.delivery.mode')) === 'digest' ? 'digest' : 'immediate'
  const intervalRaw = await settingsGet('push.delivery.interval')
  const interval = intervalRaw === 'hourly' || intervalRaw === 'every3h' ? intervalRaw : 'daily'
  return {
    mode,
    interval,
    dailyHour: await num('push.delivery.daily_hour', DEFAULT_DELIVERY.dailyHour),
    quietEnabled: (await settingsGet('push.quiet.enabled')) === 'true',
    quietStart: await num('push.quiet.start', DEFAULT_DELIVERY.quietStart),
    quietEnd: await num('push.quiet.end', DEFAULT_DELIVERY.quietEnd),
  }
}

/**
 * 매시간 — 다이제스트 모드면 발송 슬롯일 때 가족별 "마지막 다이제스트 이후 새 사진 수"를
 * 묶어 한 번에 푸시(digest.summary). 슬롯/야간/중복은 digest.ts 가 판단.
 */
async function runDigestScan(): Promise<void> {
  const settings = await readDeliverySettings()
  const now = new Date()
  const hour = now.getHours()
  const slotKey = `${now.toISOString().slice(0, 10)}-${hour}`
  const lastSlot = await settingsGet('push.digest.last_slot')
  if (!isDigestSlot(settings, hour, slotKey, lastSlot)) return
  await settingsSet('push.digest.last_slot', slotKey)

  const families = await prismaPublic.family.findMany({ select: { id: true } })
  for (const fam of families) {
    const since = await settingsGet(`push.digest.since.${fam.id}`)
    const sinceDate = since ? new Date(since) : new Date(now.getTime() - 24 * 3600 * 1000)
    const familyId = fam.id
    // 사진 + 가족 단위 콘텐츠 소식(마일스톤·성장·스토리·앨범추가)을 모두 합산한다 —
    // 다이제스트 모드에서 비-자산 알림이 조용히 사라지던 문제 수정. (댓글 멘션은 개인
    // 대상이라 다이제스트로 묶지 않고 즉시 발송 — 핸들러 면제 목록 참조.)
    const [photos, milestones, growth, stories, albumAdds] = await Promise.all([
      prismaMedia.asset.count({
        where: {
          familyId,
          status: 'ready',
          deletedAt: null,
          duplicateOf: null,
          createdAt: { gt: sinceDate },
        },
      }),
      prismaPublic.milestone.count({
        where: { familyId, deletedAt: null, createdAt: { gt: sinceDate } },
      }),
      prismaPublic.growthRecord.count({
        where: { familyId, deletedAt: null, createdAt: { gt: sinceDate } },
      }),
      prismaPublic.story.count({
        where: { familyId, deletedAt: null, createdAt: { gt: sinceDate } },
      }),
      prismaPublic.albumAsset.count({ where: { familyId, addedAt: { gt: sinceDate } } }),
    ])
    const others = milestones + growth + stories + albumAdds
    if (photos + others <= 0) {
      // 보낼 게 없으면 윈도만 전진(손실 위험 없음).
      await settingsSet(`push.digest.since.${familyId}`, now.toISOString())
      continue
    }
    await enqueueNotification({
      familyId,
      actorUserId: '',
      type: 'digest.summary',
      payload: { photos: String(photos), others: String(others), visibility: 'family' },
    })
    // since 는 enqueue 성공 후에만 전진 — 그 전에 죽으면 다음 슬롯이 같은 윈도를 다시
    // 집계(최악 다이제스트 중복)한다. since 를 먼저 올리면 그 사이 이벤트가 영구 누락된다.
    await settingsSet(`push.digest.since.${familyId}`, now.toISOString())
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
// 300s safety margin); re-minted on expiry or when the service account changes.
// Cache/pending are keyed by a fingerprint of the *encrypted service-account
// setting* (not client_email) so rotating the private key under the same email
// invalidates the cached token — otherwise a rotated/revoked key kept serving
// stale tokens for up to ~55min. pendingToken is per-fingerprint to avoid a
// concurrent mint handing back a token minted for a different account.
let fcmTokenCache: { token: string; exp: number; fingerprint: string } | null = null
const pendingTokenByFp = new Map<string, Promise<string>>()

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
  const fingerprint = createHash('sha256').update(enc).digest('hex')

  async function accessToken(): Promise<string> {
    const now = Date.now()
    if (fcmTokenCache && fcmTokenCache.exp > now && fcmTokenCache.fingerprint === fingerprint) {
      return fcmTokenCache.token
    }
    const inflight = pendingTokenByFp.get(fingerprint)
    if (inflight) return inflight
    const p = (async () => {
      try {
        const { token, expiresIn } = await getFcmAccessToken(account)
        const ttlMs = Math.max(expiresIn - 300, 60) * 1000
        fcmTokenCache = { token, exp: Date.now() + ttlMs, fingerprint }
        return token
      } finally {
        pendingTokenByFp.delete(fingerprint)
      }
    })()
    pendingTokenByFp.set(fingerprint, p)
    return p
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

  // VAPID 키는 부팅 시 web-push 전역에 한 번 설정된다. 관리자가 키를 재생성하면(설정 UI)
  // 워커가 옛 키로 서명해 모든 웹푸시가 401/403 으로 조용히 실패한다. 매 잡 전에 공개키
  // (싼 settings 읽기)만 비교해 바뀌었으면 키를 다시 읽어 setVapidDetails 갱신.
  let currentVapidPublic = keys.publicKey
  const refreshVapidIfChanged = async (): Promise<void> => {
    const latest = await settingsGet('push.vapid_public')
    if (latest && latest !== currentVapidPublic) {
      const fresh = await ensureVapidKeys({ get: settingsGet, set: settingsSet }, secretKey)
      webpush.setVapidDetails(contact, fresh.publicKey, fresh.privateKey)
      currentVapidPublic = fresh.publicKey
      console.log('[notifications-worker] VAPID keys reloaded')
    }
  }

  const connection = createRedisConnection()

  const worker = new Worker<NotificationJob>(
    NOTIFICATIONS_QUEUE,
    async (job: Job<NotificationJob>) => {
      if (job.name === MEMORIES_SCAN_JOB) {
        await runMemoriesScan()
        return
      }
      if (job.name === DIGEST_SCAN_JOB) {
        await runDigestScan()
        return
      }
      if (job.name === BACKUP_TICK_JOB) {
        await runScheduledBackupTick(new Date(), prismaPublic, (m) =>
          console.log('[backup-tick]', m),
        )
        return
      }
      if (job.name === TRASH_PURGE_JOB) {
        await runTrashPurge()
        return
      }
      // 얼굴 인식(옵트인) — 새 사진이 ready 되면(asset.uploaded) features.faces 켜진
      // 인스턴스만 face-detect 잡을 enqueue. media 는 public 설정을 못 읽으므로 web 이
      // 게이팅한다(§17#10 upload.convert_to_compatible 와 동일 패턴). 푸시 게이트와
      // 무관하게 항상 시도(알림 수신자 0명이어도 얼굴 인식은 돈다).
      if (job.data.type === 'asset.uploaded') {
        const assetId = job.data.payload.assetId
        if (assetId && (await isFeatureEnabled('faces', prismaPublic))) {
          const raw = await getSetting(
            'faces.cluster_distance',
            // finite 만 — NaN/Infinity 가 들어오면 clamp 가 NaN 을 통과시켜 군집이 붕괴된다.
            z.number().finite(),
            DEFAULT_FACE_CLUSTER_DISTANCE,
            prismaPublic,
          )
          const clusterDistance = Math.min(
            FACE_CLUSTER_DISTANCE_MAX,
            Math.max(FACE_CLUSTER_DISTANCE_MIN, raw),
          )
          await enqueueFaceDetect({
            type: 'face-detect',
            familyId: job.data.familyId,
            assetId,
            clusterDistance,
          })
        }
      }
      // 스토리 첨부 사진은 개별 푸시를 생략(얼굴 인식 등 후처리는 위에서 이미 처리). 스토리
      // 생성이 보내는 diary.created 푸시 하나로 갈음 — 중복 알림(사진+스토리) 방지.
      if (job.data.type === 'asset.uploaded' && job.data.payload.suppressPush === 'true') {
        return
      }
      // 발송 방식 게이트 — memory.*·digest.summary 는 이미 예약/요약이라 면제.
      // comment.created(개인 멘션)도 면제 — 다이제스트 스캔은 가족 단위 콘텐츠만 모으고
      // 멘션은 개인 대상이라 브로드캐스트로 묶지 않고 즉시 발송(야간 보류는 적용). 그 외
      // 가족 콘텐츠 이벤트는 다이제스트 모드면 즉시 발송 안 하고(스캔이 모아 보냄).
      const t = job.data.type
      const digestExempt =
        t === 'digest.summary' || t.startsWith('memory.') || t === 'comment.created'
      const delivery = await readDeliverySettings()
      const hour = new Date().getHours()
      if (t === 'comment.created') {
        // 멘션도 야간(방해금지)엔 보류 — 다이제스트 모드라도 즉시 발송하되 야간만 막는다.
        if (inQuietHours(delivery, hour)) return
      } else if (!digestExempt) {
        if (!shouldSendImmediate(delivery, hour)) return
      }
      await refreshVapidIfChanged()
      const fcm = await buildFcmDeps()
      await handleNotificationJob(job.data, {
        ...(fcm ?? {}),
        settingsGet,
        enrich: resolveNotifContext,
        loadFamily: async (familyId) => {
          // 제외(deletedAt)·정지(suspendedAt)된 멤버는 수신자에서 빼야 한다 — 안 그러면
          // 가족에서 내보낸 사람도 계속 푸시를 받는다.
          const rows = await prismaPublic.membership.findMany({
            where: { familyId, deletedAt: null, suspendedAt: null },
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
        deleteSub: async ({ endpoint, userId }) => {
          await prismaPublic.pushSubscription.deleteMany({ where: { endpoint, userId } })
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
  // 매시간 정각 다이제스트 스캔(슬롯/야간 판단은 핸들러가) — 반복 작업 1개.
  await queue.add(
    DIGEST_SCAN_JOB,
    {},
    { repeat: { pattern: '0 * * * *' }, jobId: DIGEST_SCAN_JOB, removeOnComplete: true },
  )
  // 매시간(분 5) 백업 스케줄 틱 — 설정대로 시각 맞으면 백업 생성 + 보존 정리.
  await queue.add(TRASH_PURGE_JOB, {} as NotificationJob, {
    repeat: { pattern: '30 3 * * *' },
    jobId: TRASH_PURGE_JOB,
    removeOnComplete: true,
  })
  await queue.add(
    BACKUP_TICK_JOB,
    {},
    { repeat: { pattern: '5 * * * *' }, jobId: BACKUP_TICK_JOB, removeOnComplete: true },
  )

  console.log('[notifications-worker] started')
}

void main()
