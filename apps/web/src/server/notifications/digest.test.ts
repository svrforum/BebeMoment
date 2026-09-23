import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DELIVERY,
  type DeliverySettings,
  inQuietHours,
  isDeliveryExempt,
  isDigestSlot,
  shouldSendImmediate,
} from './digest'

const s = (o: Partial<DeliverySettings>): DeliverySettings => ({ ...DEFAULT_DELIVERY, ...o })

describe('inQuietHours', () => {
  it('비활성이면 항상 false', () => {
    expect(inQuietHours(s({ quietEnabled: false }), 3)).toBe(false)
  })
  it('자정 넘는 구간 22~8', () => {
    const q = s({ quietEnabled: true, quietStart: 22, quietEnd: 8 })
    expect(inQuietHours(q, 23)).toBe(true)
    expect(inQuietHours(q, 2)).toBe(true)
    expect(inQuietHours(q, 8)).toBe(false)
    expect(inQuietHours(q, 12)).toBe(false)
  })
  it('일반 구간 1~6', () => {
    const q = s({ quietEnabled: true, quietStart: 1, quietEnd: 6 })
    expect(inQuietHours(q, 3)).toBe(true)
    expect(inQuietHours(q, 6)).toBe(false)
    expect(inQuietHours(q, 0)).toBe(false)
  })
})

describe('shouldSendImmediate', () => {
  it('immediate + 비야간 → true', () => {
    expect(shouldSendImmediate(s({ mode: 'immediate' }), 12)).toBe(true)
  })
  it('immediate 라도 야간이면 false', () => {
    expect(
      shouldSendImmediate(
        s({ mode: 'immediate', quietEnabled: true, quietStart: 22, quietEnd: 8 }),
        2,
      ),
    ).toBe(false)
  })
  it('digest 모드면 즉시 발송 안 함', () => {
    expect(shouldSendImmediate(s({ mode: 'digest' }), 12)).toBe(false)
  })
})

describe('isDigestSlot', () => {
  it('immediate 모드면 항상 false', () => {
    expect(isDigestSlot(s({ mode: 'immediate' }), 9, 'k', null)).toBe(false)
  })
  it('hourly 는 매시간(야간 제외)', () => {
    const d = s({ mode: 'digest', interval: 'hourly' })
    expect(isDigestSlot(d, 12, 'k', null)).toBe(true)
    expect(isDigestSlot(d, 12, 'k', 'k')).toBe(false) // 같은 슬롯 중복 방지
  })
  it('every3h 는 3의 배수 시각만', () => {
    const d = s({ mode: 'digest', interval: 'every3h' })
    expect(isDigestSlot(d, 9, 'k', null)).toBe(true)
    expect(isDigestSlot(d, 10, 'k', null)).toBe(false)
  })
  it('daily 는 지정 시각만', () => {
    const d = s({ mode: 'digest', interval: 'daily', dailyHour: 9 })
    expect(isDigestSlot(d, 9, 'k', null)).toBe(true)
    expect(isDigestSlot(d, 10, 'k', null)).toBe(false)
  })
  it('야간이면 슬롯이어도 false', () => {
    const d = s({
      mode: 'digest',
      interval: 'hourly',
      quietEnabled: true,
      quietStart: 22,
      quietEnd: 8,
    })
    expect(isDigestSlot(d, 2, 'k', null)).toBe(false)
  })
})

describe('isDeliveryExempt', () => {
  it('이미 예약·요약된 알림은 발송 방식 게이트를 면제한다', () => {
    expect(isDeliveryExempt('digest.summary')).toBe(true)
    expect(isDeliveryExempt('memory.yearly')).toBe(true)
    expect(isDeliveryExempt('memory.monthly')).toBe(true)
    expect(isDeliveryExempt('comment.created')).toBe(true)
  })

  it('사용자가 시각을 직접 고른 일정 알림도 면제한다', () => {
    // 면제하지 않으면 다이제스트 모드에서 모든 시각에 막히고, 다이제스트 집계는 일정을
    // 세지 않아 알림이 영구히 사라진다.
    expect(isDeliveryExempt('schedule.reminder')).toBe(true)
  })

  it('일정이 추가됐다는 소식은 면제하지 않는다', () => {
    // 알람과 다르다 — 사용자가 고른 시각이 아니라 남이 방금 한 일을 알리는 것이라
    // 조용한 시간에 집을 깨우면 안 된다.
    expect(isDeliveryExempt('schedule.created')).toBe(false)
    expect(isDeliveryExempt('schedule.updated')).toBe(false)
  })

  it('가족 콘텐츠 알림은 면제하지 않는다', () => {
    expect(isDeliveryExempt('asset.uploaded')).toBe(false)
    expect(isDeliveryExempt('diary.created')).toBe(false)
    expect(isDeliveryExempt('growth.created')).toBe(false)
  })
})
