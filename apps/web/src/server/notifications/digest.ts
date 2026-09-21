import type { NotificationEventType } from '@bebe/core'

export type DeliverySettings = {
  mode: 'immediate' | 'digest'
  interval: 'hourly' | 'every3h' | 'daily'
  dailyHour: number // 0-23, daily 모드 발송 시각
  quietEnabled: boolean
  quietStart: number // 0-23
  quietEnd: number // 0-23
}

export const DEFAULT_DELIVERY: DeliverySettings = {
  mode: 'immediate',
  interval: 'daily',
  dailyHour: 9,
  quietEnabled: false,
  quietStart: 22,
  quietEnd: 8,
}

/** `hour`(0-23)가 야간(방해금지) 구간이면 true. start>end 면 자정을 넘는 구간(예: 22~8). */
export function inQuietHours(s: DeliverySettings, hour: number): boolean {
  if (!s.quietEnabled || s.quietStart === s.quietEnd) return false
  return s.quietStart < s.quietEnd
    ? hour >= s.quietStart && hour < s.quietEnd
    : hour >= s.quietStart || hour < s.quietEnd
}

/** 즉시 발송 모드이고 야간이 아니면 true(개별 이벤트를 바로 푸시). */
export function shouldSendImmediate(s: DeliverySettings, hour: number): boolean {
  return s.mode === 'immediate' && !inQuietHours(s, hour)
}

/**
 * 지금이 다이제스트 발송 슬롯인지. interval 별 시각 + 야간 제외 + 같은 슬롯 중복 방지
 * (`slotKey`!=`lastSlotKey`). 다이제스트 스캔은 매시간 돌며 이 함수로 발송 여부를 판단.
 */
export function isDigestSlot(
  s: DeliverySettings,
  hour: number,
  slotKey: string,
  lastSlotKey: string | null,
): boolean {
  if (s.mode !== 'digest') return false
  if (inQuietHours(s, hour)) return false
  if (lastSlotKey === slotKey) return false
  if (s.interval === 'hourly') return true
  if (s.interval === 'every3h') return hour % 3 === 0
  return hour === s.dailyHour // daily
}

/**
 * 발송 방식 게이트(다이제스트 모드·조용한 시간)를 면제하는 이벤트.
 *
 * - `digest.summary`·`memory.*` — 이미 예약/요약이라 다시 묶을 게 없다.
 * - `comment.created` — 개인 멘션이라 브로드캐스트로 묶지 않는다(야간 보류는 호출부가 따로).
 * - `schedule.reminder` — 사용자가 시각을 직접 고른 알림이라 늦게 오면 장애다. 면제하지 않으면
 *   다이제스트 모드에서 **모든 시각에** 막히는데, 다이제스트 집계는 일정을 세지 않으므로
 *   그 알림은 로그 한 줄 없이 영구히 사라진다.
 */
export function isDeliveryExempt(type: NotificationEventType): boolean {
  return (
    type === 'digest.summary' ||
    type.startsWith('memory.') ||
    type === 'comment.created' ||
    type === 'schedule.reminder'
  )
}
