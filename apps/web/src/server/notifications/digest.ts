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
