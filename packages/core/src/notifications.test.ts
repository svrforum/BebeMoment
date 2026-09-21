import { describe, expect, it } from 'vitest'
import { NOTIFICATION_CATEGORIES, categoryForEvent } from './notifications'

describe('notifications', () => {
  it('6개 카테고리', () => {
    expect(NOTIFICATION_CATEGORIES).toEqual([
      'asset_upload',
      'comment_mention',
      'album_add',
      'diary_growth_milestone',
      'memory',
      'schedule_reminder',
    ])
  })
  it('이벤트 타입 → 카테고리 매핑', () => {
    expect(categoryForEvent('asset.uploaded')).toBe('asset_upload')
    expect(categoryForEvent('comment.created')).toBe('comment_mention')
    expect(categoryForEvent('album.asset_added')).toBe('album_add')
    expect(categoryForEvent('diary.created')).toBe('diary_growth_milestone')
    expect(categoryForEvent('growth.created')).toBe('diary_growth_milestone')
    expect(categoryForEvent('milestone.created')).toBe('diary_growth_milestone')
    expect(categoryForEvent('memory.yearly')).toBe('memory')
    expect(categoryForEvent('memory.monthly')).toBe('memory')
  })

  it('일정 알림 카테고리가 있다', () => {
    expect(NOTIFICATION_CATEGORIES).toContain('schedule_reminder')
    expect(categoryForEvent('schedule.reminder')).toBe('schedule_reminder')
  })
})
