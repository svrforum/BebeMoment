import { type NotificationJob, categoryForEvent } from '@bebe/core'
import type { Locale } from '@/i18n/request'
import { type ServerT, getServerTranslator } from '@/i18n/translator'
import { resolveRecipients } from './recipients'

type PushT = ServerT

/** comment.created payload 는 mentionedUserIds 를 JSON 문자열로 싣는다. */
function parseMentionedUserIds(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : undefined
  } catch {
    return undefined
  }
}

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
  deleteSub: (sub: { endpoint: string; userId: string }) => Promise<void>
  // Optional native (FCM) path — only wired when FCM is configured.
  deviceTokensFor?: (userIds: string[]) => Promise<{ token: string; userId: string }[]>
  sendFcm?: (token: string, payload: FcmNotification) => Promise<'ok' | 'expired' | 'error'>
  deleteDeviceToken?: (input: { userId: string; token: string }) => Promise<void>
  // 문구용 컨텍스트(가족명·아기명·앨범명·마일스톤·댓글 일부) 조회. 미주입 시 기본 제목.
  enrich?: (job: NotificationJob) => Promise<NotifContext>
}

/**
 * 푸시 문구 컨텍스트 — 워커가 발송 전 조회해 채운다. 제목은 가족명으로 통일하고
 * 본문엔 아기명·앨범명·마일스톤 항목·댓글 일부 같은 구체 정보를 넣어 따뜻하게.
 */
export type NotifContext = {
  familyName: string
  babyName?: string
  albumName?: string
  milestoneLabel?: string
  commentSnippet?: string
}

export function buildNotification(
  job: NotificationJob,
  ctx: NotifContext,
  t: PushT,
): {
  title: string
  body: string
  url: string
} {
  const title = ctx.familyName || t('titleFallback')
  switch (job.type) {
    case 'asset.uploaded':
      return { title, body: t('assetUploaded'), url: `/detail/${job.payload.assetId}` }
    case 'comment.created':
      return {
        title,
        body: ctx.commentSnippet
          ? t('commentMentionSnippet', { snippet: ctx.commentSnippet })
          : t('commentMention'),
        url: `/detail/${job.payload.assetId}`,
      }
    case 'album.asset_added':
      return {
        title,
        body: ctx.albumName ? t('albumAddedNamed', { album: ctx.albumName }) : t('albumAdded'),
        url: `/albums/${job.payload.albumId}`,
      }
    case 'diary.created':
      return { title, body: t('diaryCreated'), url: `/story/${job.payload.entryId}` }
    case 'growth.created':
      return {
        title,
        body: t('growthCreated', { baby: ctx.babyName ? `${ctx.babyName} ` : '' }),
        url: '/timeline',
      }
    case 'milestone.created':
      return {
        title,
        body: t('milestoneCreated', {
          baby: ctx.babyName ? `${ctx.babyName} ` : '',
          label: ctx.milestoneLabel ? ` · ${ctx.milestoneLabel}` : '',
        }),
        url: '/timeline',
      }
    case 'memory.yearly':
    case 'memory.monthly': {
      const interval = job.payload.interval ?? '예전'
      const count = job.payload.count ?? ''
      return {
        title,
        body: count ? t('memoryWithCount', { interval, count }) : t('memory', { interval }),
        url: '/memories',
      }
    }
    case 'digest.summary': {
      const photos = Number(job.payload.photos ?? '0')
      const others = Number(job.payload.others ?? '0')
      let body: string
      if (photos > 0 && others > 0) body = t('digestBoth', { photos, others })
      else if (photos > 0) body = t('digestPhotos', { photos })
      else if (others > 0) body = t('digestOthers', { others })
      else body = t('digestEmpty')
      return { title, body, url: '/timeline' }
    }
  }
}

export async function handleNotificationJob(job: NotificationJob, deps: Deps): Promise<void> {
  if ((await deps.settingsGet('push.enabled')) === 'false') return
  const category = categoryForEvent(job.type)
  if ((await deps.settingsGet(`push.categories.${category}.enabled`)) === 'false') return

  const { members, visibility } = await deps.loadFamily(job.familyId)
  const mentionedUserIds = parseMentionedUserIds(job.payload.mentionedUserIds)
  const candidates = resolveRecipients({
    members,
    actorUserId: job.actorUserId,
    category,
    visibility,
    ...(mentionedUserIds ? { mentionedUserIds } : {}),
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

  const ctx = deps.enrich ? await deps.enrich(job) : { familyName: '' }
  const locale: Locale =
    (await deps.settingsGet('appearance.default_locale')) === 'en' ? 'en' : 'ko'
  const notification = buildNotification(job, ctx, getServerTranslator(locale, 'push'))
  const subs = await deps.subscriptionsFor(recipients)
  const payload = JSON.stringify(notification)
  await Promise.all(
    subs.map(async (s) => {
      try {
        await deps.send({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload)
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        // endpoint+userId 로 스코프 — 그 사이 다른 유저에 재등록된 endpoint 를 지우지 않게.
        if (code === 404 || code === 410)
          await deps.deleteSub({ endpoint: s.endpoint, userId: s.userId })
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
        } catch (e) {
          // FCM 실패가 잡을 깨선 안 됨(웹푸시는 이미 성공). 단, 조용히 삼키지 말고 로그 —
          // OAuth 토큰 발급 실패 같은 FCM 전체 장애를 드러내기 위해(조용한 실패 금지).
          console.error('[notifications] FCM send failed', (e as Error).message)
        }
      }),
    )
  }
}
