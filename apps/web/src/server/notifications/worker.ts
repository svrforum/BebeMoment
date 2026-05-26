import { type NotificationJob, categoryForEvent } from '@bebe/core'
import { resolveRecipients } from './recipients'

type Sub = { endpoint: string; p256dh: string; auth: string }
type Deps = {
  settingsGet: (key: string) => Promise<string | null>
  loadFamily: (familyId: string) => Promise<{
    members: { userId: string; role: 'owner' | 'guardian' | 'family' }[]
    visibility: 'family' | 'guardians'
  }>
  prefEnabled: (userId: string, category: string) => Promise<boolean>
  subscriptionsFor: (userIds: string[]) => Promise<(Sub & { userId: string })[]>
  send: (sub: Sub, payload: string) => Promise<void>
  deleteSub: (endpoint: string) => Promise<void>
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
        body: '내 사진에 댓글이 달렸어요',
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
        title: '새 일기',
        body: '새 일기가 등록됐어요',
        url: `/diary/${job.payload.entryId}`,
      }
    case 'growth.created':
      return { title: '성장 기록', body: '새 성장 기록이 등록됐어요', url: '/timeline' }
    case 'milestone.created':
      return { title: '마일스톤', body: '새 마일스톤이 등록됐어요', url: '/timeline' }
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
  const recipients: string[] = []
  for (const uid of candidates) if (await deps.prefEnabled(uid, category)) recipients.push(uid)
  if (recipients.length === 0) return

  const subs = await deps.subscriptionsFor(recipients)
  const payload = JSON.stringify(buildNotification(job))
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
}
