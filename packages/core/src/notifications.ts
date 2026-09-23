export const NOTIFICATION_CATEGORIES = [
  'asset_upload',
  'comment_mention',
  'album_add',
  'diary_growth_milestone',
  'memory',
  'schedule_reminder',
  'schedule_changed',
] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export type NotificationEventType =
  | 'asset.uploaded'
  | 'comment.created'
  | 'album.asset_added'
  | 'diary.created'
  | 'growth.created'
  | 'milestone.created'
  | 'memory.yearly'
  | 'memory.monthly'
  | 'digest.summary'
  | 'schedule.reminder'
  | 'schedule.created'
  | 'schedule.updated'

const EVENT_CATEGORY: Record<NotificationEventType, NotificationCategory> = {
  'asset.uploaded': 'asset_upload',
  'comment.created': 'comment_mention',
  'album.asset_added': 'album_add',
  'diary.created': 'diary_growth_milestone',
  'growth.created': 'diary_growth_milestone',
  'milestone.created': 'diary_growth_milestone',
  'memory.yearly': 'memory',
  'memory.monthly': 'memory',
  // 다이제스트 요약 — 새 사진 묶음 알림이라 사진 카테고리로 게이팅.
  'digest.summary': 'asset_upload',
  'schedule.reminder': 'schedule_reminder',
  // 알람과 분리한다 — '누가 일정을 추가했다' 소식을 끈 사람이 접종 알람까지 잃으면 안 된다.
  'schedule.created': 'schedule_changed',
  'schedule.updated': 'schedule_changed',
}
export function categoryForEvent(t: NotificationEventType): NotificationCategory {
  return EVENT_CATEGORY[t]
}

export const NOTIFICATIONS_QUEUE = 'notifications'
/**
 * 일정 알림 틱 전용 큐. 유지보수 큐(concurrency 1)에 넣으면 몇 분씩 도는 백업 뒤에 틱이
 * 줄을 서서, 사용자가 시각을 고른 알림이 늦는다.
 */
export const REMINDERS_QUEUE = 'reminders'
export const SCHEDULE_REMINDER_TICK_JOB = 'schedule-reminder-tick'
export type NotificationJob = {
  familyId: string
  actorUserId: string
  type: NotificationEventType
  payload: Record<string, string>
}
