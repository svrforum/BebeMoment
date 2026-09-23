import { describe, expect, it } from 'vitest'
import { NOTIFICATION_CATEGORIES, categoryForEvent } from './notifications'

describe('notifications', () => {
  it('7개 카테고리', () => {
    expect(NOTIFICATION_CATEGORIES).toEqual([
      'asset_upload',
      'comment_mention',
      'album_add',
      'diary_growth_milestone',
      'memory',
      'schedule_reminder',
      'schedule_changed',
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

  it('일정 추가 알림은 별도 카테고리다', () => {
    // 알람(schedule_reminder)과 한 카테고리로 묶으면 '누가 일정을 추가했다' 소식이 시끄러워
    // 끈 사람이 접종 알람까지 잃는다.
    expect(NOTIFICATION_CATEGORIES).toContain('schedule_changed')
    expect(categoryForEvent('schedule.created')).toBe('schedule_changed')
    expect(categoryForEvent('schedule.created')).not.toBe(categoryForEvent('schedule.reminder'))
    // 추가와 변경은 같은 소식이라 한 설정으로 함께 끈다. 알람과는 여전히 다르다.
    expect(categoryForEvent('schedule.updated')).toBe('schedule_changed')
  })
})
