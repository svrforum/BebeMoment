import { type NotificationJob, categoryForEvent } from '@bebe/core'
import { resolveRecipients } from './recipients'

type Sub = { endpoint: string; p256dh: string; auth: string }
type FcmNotification = { title: string; body: string; url: string }
type Deps = {
  settingsGet: (key: string) => Promise<string | null>
  loadFamily: (familyId: string) => Promise<{
    members: { userId: string; role: 'owner' | 'guardian' | 'family' }[]
    visibility: 'family' | 'guardians'
  }>
  prefEnabled?: (userId: string, category: string) => Promise<boolean>
  // Batched per-user pref lookup. One findMany per job instead of N queries.
  // When provided, takes precedence over prefEnabled.
  prefsEnabledFor?: (userIds: string[], category: string) => Promise<Set<string>>
  subscriptionsFor: (userIds: string[]) => Promise<(Sub & { userId: string })[]>
  send: (sub: Sub, payload: string) => Promise<void>
  deleteSub: (endpoint: string) => Promise<void>
  // Optional native (FCM) path — only wired when FCM is configured.
  deviceTokensFor?: (userIds: string[]) => Promise<{ token: string; userId: string }[]>
  sendFcm?: (token: string, payload: FcmNotification) => Promise<'ok' | 'expired' | 'error'>
  deleteDeviceToken?: (input: { userId: string; token: string }) => Promise<void>
}

export function buildNotification(job: NotificationJob): {
  title: string
  body: string
  url: string
} {
  switch (job.type) {
    case 'asset.uploaded':
      return {
        title: '새 사진',
        body: '가족이 새 사진을 올렸어요',
        url: `/detail/${job.payload.assetId}`,
      }
    case 'comment.created':
      return {
        title: '새 댓글',
        body: '사진에 새 댓글이 달렸어요',
        url: `/detail/${job.payload.assetId}`,
      }
    case 'album.asset_added':
      return {
        title: '앨범 업데이트',
        body: '앨범에 새 사진이 추가됐어요',
        url: `/albums/${job.payload.albumId}`,
      }
    case 'diary.created':
      return {
        title: '새 스토리',
        body: '새 스토리가 등록됐어요',
        url: `/story/${job.payload.entryId}`,
      }
    case 'growth.created':
      return { title: '성장 기록', body: '새 성장 기록이 등록됐어요', url: '/timeline' }
    case 'milestone.created':
      return { title: '마일스톤', body: '새 마일스톤이 등록됐어요', url: '/timeline' }
    case 'memory.yearly':
    case 'memory.monthly': {
      const interval = job.payload.interval ?? '예전'
      const count = job.payload.count ?? ''
      return {
        title: '오늘의 추억',
        body: `${interval} 전 오늘${count ? ` · 사진 ${count}장` : ''}`,
        url: '/memories',
      }
    }
  }
}

export async function handleNotificationJob(job: NotificationJob, deps: Deps): Promise<void> {
  if ((await deps.settingsGet('push.enabled')) === 'false') return
  const category = categoryForEvent(job.type)
  if ((await deps.settingsGet(`push.categories.${category}.enabled`)) === 'false') return

  const { members, visibility } = await deps.loadFamily(job.familyId)
  const candidates = resolveRecipients({
    members,
    actorUserId: job.actorUserId,
    category,
    visibility,
  })
  let recipients: string[] = []
  if (deps.prefsEnabledFor) {
    if (candidates.length > 0) {
      const allowed = await deps.prefsEnabledFor(candidates, category)
      recipients = candidates.filter((uid) => allowed.has(uid))
    }
  } else if (deps.prefEnabled) {
    const prefEnabled = deps.prefEnabled
    for (const uid of candidates) if (await prefEnabled(uid, category)) recipients.push(uid)
  } else {
    // No pref dep wired — default enabled.
    recipients = candidates
  }
  if (recipients.length === 0) return

  const notification = buildNotification(job)
  const subs = await deps.subscriptionsFor(recipients)
  const payload = JSON.stringify(notification)
  await Promise.all(
    subs.map(async (s) => {
      try {
        await deps.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload)
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) await deps.deleteSub(s.endpoint)
      }
    }),
  )

  const { deviceTokensFor, sendFcm, deleteDeviceToken } = deps
  if (deviceTokensFor && sendFcm && deleteDeviceToken) {
    const tokens = await deviceTokensFor(recipients)
    await Promise.all(
      tokens.map(async (t) => {
        try {
          const result = await sendFcm(t.token, notification)
          if (result === 'expired') await deleteDeviceToken({ userId: t.userId, token: t.token })
        } catch {
          // FCM failures must not fail the job — web-push already succeeded.
        }
      }),
    )
  }
}
