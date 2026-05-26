export const NOTIFICATION_CATEGORIES = [
  'asset_upload',
  'comment_mention',
  'album_add',
  'diary_growth_milestone',
] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export type NotificationEventType =
  | 'asset.uploaded'
  | 'comment.created'
  | 'album.asset_added'
  | 'diary.created'
  | 'growth.created'
  | 'milestone.created'

const EVENT_CATEGORY: Record<NotificationEventType, NotificationCategory> = {
  'asset.uploaded': 'asset_upload',
  'comment.created': 'comment_mention',
  'album.asset_added': 'album_add',
  'diary.created': 'diary_growth_milestone',
  'growth.created': 'diary_growth_milestone',
  'milestone.created': 'diary_growth_milestone',
}
export function categoryForEvent(t: NotificationEventType): NotificationCategory {
  return EVENT_CATEGORY[t]
}

export const NOTIFICATIONS_QUEUE = 'notifications'
export type NotificationJob = {
  familyId: string
  actorUserId: string
  type: NotificationEventType
  payload: Record<string, string>
}
