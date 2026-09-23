import { type NotificationJob, categoryForEvent } from '@bebe/core'
import type { Locale } from '@/i18n/locales'
import { clockParts } from '@/lib/clock'
import { logger } from '@/lib/logger'
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

type Member = { userId: string; role: 'owner' | 'guardian' | 'family' }
function guardianIds(members: Member[]): string[] {
  return members.filter((m) => m.role === 'owner' || m.role === 'guardian').map((m) => m.userId)
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
    case 'growth.created': {
      // 성장기록은 타임라인에 없다 — 타임라인으로 보내면 알림을 눌러도 그 기록을 찾을 수
      // 없다. 잡 페이로드에 babyId·recordId 가 이미 실려 있으니 그 화면으로 바로 보낸다.
      // (이 변경 전에 큐에 들어간 잡에는 없을 수 있어 타임라인 폴백을 남긴다.)
      const { babyId, recordId } = job.payload
      return {
        title,
        body: t('growthCreated', { baby: ctx.babyName ? `${ctx.babyName} ` : '' }),
        url: babyId && recordId ? `/babies/${babyId}/growth/${recordId}` : '/timeline',
      }
    }
    case 'milestone.created': {
      const { babyId, milestoneId } = job.payload
      return {
        title,
        body: t('milestoneCreated', {
          baby: ctx.babyName ? `${ctx.babyName} ` : '',
          label: ctx.milestoneLabel ? ` · ${ctx.milestoneLabel}` : '',
        }),
        url: babyId && milestoneId ? `/babies/${babyId}/milestones/${milestoneId}` : '/timeline',
      }
    }
    case 'memory.yearly':
    case 'memory.monthly': {
      // 잡 페이로드는 로케일을 모른다 — 간격을 구조(kind·n)로 싣고 여기서 문장으로 만든다.
      // `interval` 문자열은 이 변경 전에 큐에 남아 있던 잡을 위한 폴백.
      const kind = job.payload.intervalKind
      const n = Number(job.payload.intervalN ?? '')
      const interval =
        (kind === 'year' || kind === 'month') && Number.isFinite(n)
          ? t(kind === 'year' ? 'intervalYear' : 'intervalMonth', { n })
          : (job.payload.interval ?? t('intervalUnknown'))
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
    case 'schedule.reminder':
      // url 은 반드시 일정 상세다. `/calendar` 로 보내면 서비스 워커가 이미 열려 있는
      // 캘린더 창을 url.includes() 로 찾아 포커스만 하고 이동하지 않아 엉뚱한 달을 보게 된다.
      return {
        title: t('scheduleReminder.title'),
        body: job.payload.title ?? t('scheduleReminder.title'),
        url: `/schedule/${job.payload.entryId}`,
      }
    case 'schedule.created':
    case 'schedule.updated': {
      // 알람이 아니라 '누가 일정을 넣었다/고쳤다'는 소식이다. 무엇이 언제인지 본문에 담는다.
      const ns = job.type === 'schedule.created' ? 'scheduleCreated' : 'scheduleUpdated'
      const what = job.payload.title ?? ''
      const url = `/schedule/${job.payload.entryId}`
      const when = scheduleWallClock(job.payload.onDate, job.payload.startMinute)
      if (!when) return { title, body: t(`${ns}.noDate`, { title: what }), url }
      if (when.minute === null) {
        return { title, body: t(`${ns}.allDay`, { title: what, when: when.at }), url }
      }
      // 시각의 오전/오후 낱말은 카탈로그가 붙인다 — Intl 에 맡기면 ICU 판에 따라 한국어가
      // "AM 10:00" 으로 나온다(`lib/clock.ts`).
      const { period, hour12, minute2 } = clockParts(when.minute)
      return {
        title,
        body: t(`${ns}.withTime`, {
          title: what,
          when: when.at,
          period,
          time: `${hour12}:${minute2}`,
        }),
        url,
      }
    }
  }
}

/**
 * 일정은 벽시계로 저장된다(`on_date` + 분). 번역기가 UTC 로 포맷하므로 벽시계를 UTC 자정에
 * 얹어 넘긴다 — 컨테이너 시간대가 무엇이든 사용자가 고른 그 날짜·시각이 그대로 찍힌다.
 * 큐에 남아 있던 옛 잡이나 깨진 값은 날짜 없는 문구로 접는다(잡 하나가 워커를 물고 늘어지지 않게).
 */
function scheduleWallClock(
  onDate: string | undefined,
  startMinute: string | undefined,
): { at: Date; minute: number | null } | null {
  if (!onDate) return null
  const midnight = new Date(`${onDate}T00:00:00.000Z`)
  if (Number.isNaN(midnight.getTime())) return null
  const parsed = startMinute === undefined ? Number.NaN : Number(startMinute)
  const minute = Number.isFinite(parsed) ? parsed : null
  return { at: new Date(midnight.getTime() + (minute ?? 0) * 60_000), minute }
}

/**
 * 잡이 발송까지 못 간 이유를 남긴다. 조용히 return 하면 '보냈는데 안 왔다'와 '아예 안 보냈다'를
 * 구분할 수 없고, 일정 알림은 원장이 이미 '보냄'으로 굳은 뒤라 재현 말고는 방법이 없다(§6.5.1).
 */
function logDrop(job: NotificationJob, reason: string, extra?: Record<string, unknown>): void {
  logger.info(
    { type: job.type, familyId: job.familyId, reason, ...extra },
    'notifications: dropped',
  )
}

export async function handleNotificationJob(job: NotificationJob, deps: Deps): Promise<void> {
  if ((await deps.settingsGet('push.enabled')) === 'false') {
    logDrop(job, 'push disabled')
    return
  }
  const category = categoryForEvent(job.type)
  if ((await deps.settingsGet(`push.categories.${category}.enabled`)) === 'false') {
    logDrop(job, 'category disabled', { category })
    return
  }

  const { members, visibility } = await deps.loadFamily(job.familyId)
  const mentionedUserIds = parseMentionedUserIds(job.payload.mentionedUserIds)
  // 일정 알림 둘은 기본 수신자 계산을 타지 않는다. 일정이 보호자 전용 기능이라 나머지
  // 구성원은 볼 수도 없는 것을 알림으로 받으면 안 되고, 작성자 처리도 정반대이기 때문이다 —
  // 알람(reminder)은 만든 사람이 그 일을 해야 하는 사람이라 포함하고, 추가 소식(created)은
  // 만든 사람만 빼고 보낸다. loadFamily 가 제외·정지 멤버를 이미 걸러 준다.
  const candidates =
    job.type === 'schedule.reminder'
      ? guardianIds(members)
      : job.type === 'schedule.created' || job.type === 'schedule.updated'
        ? // 반대로 만들거나 고친 사람은 뺀다 — 자기가 방금 한 일을 다시 알려 줄 필요가 없다.
          guardianIds(members).filter((uid) => uid !== job.actorUserId)
        : resolveRecipients({
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
  if (recipients.length === 0) {
    logDrop(job, 'no recipients', { category, candidates: candidates.length })
    return
  }

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
        if (code === 404 || code === 410) {
          await deps.deleteSub({ endpoint: s.endpoint, userId: s.userId })
          return
        }
        // 죽은 구독이 아니면 살아 있는 기기에 못 보낸 것이다 — VAPID 불일치(403)나 푸시
        // 서비스 장애는 전원에게 같은 영향을 주는데, 로그가 없으면 흔적이 아예 남지 않는다.
        // endpoint 는 그 자체가 비밀이라 싣지 않는다.
        logger.error({ err: e, code, type: job.type }, 'notifications: web push send failed')
      }
    }),
  )

  let tokenCount = 0
  const { deviceTokensFor, sendFcm, deleteDeviceToken } = deps
  if (deviceTokensFor && sendFcm && deleteDeviceToken) {
    const tokens = await deviceTokensFor(recipients)
    tokenCount = tokens.length
    await Promise.all(
      tokens.map(async (t) => {
        try {
          const result = await sendFcm(t.token, notification)
          if (result === 'expired') await deleteDeviceToken({ userId: t.userId, token: t.token })
        } catch (e) {
          // FCM 실패가 잡을 깨선 안 됨(웹푸시는 이미 성공). 단, 조용히 삼키지 말고 로그 —
          // OAuth 토큰 발급 실패 같은 FCM 전체 장애를 드러내기 위해(조용한 실패 금지).
          logger.error({ err: e }, 'notifications: FCM send failed')
        }
      }),
    )
  }

  if (subs.length === 0 && tokenCount === 0) {
    // 받을 사람은 있는데 등록된 기기가 하나도 없다 — 사용자 눈에는 '알림이 안 온다'로 보이고
    // 일정 알림은 원장이 '보냄'으로 남아 재시도도 없다. 진단의 유일한 단서다.
    logger.warn(
      { type: job.type, familyId: job.familyId, recipients: recipients.length },
      'notifications: nothing delivered — no push subscriptions',
    )
  }
}
