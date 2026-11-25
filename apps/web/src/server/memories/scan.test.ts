import type { MemoryInterval } from '@bebe/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MemoryGroup } from './list'
import { decideMemoryPush } from './scan'

// 카운트만 중요 — assets 길이로 count 가 정해지므로 더미 배열 길이만 맞춘다.
function grp(interval: MemoryInterval, assetCount: number): MemoryGroup {
  return {
    interval,
    // biome-ignore lint/suspicious/noExplicitAny: 테스트 더미 — 길이만 의미
    assets: Array(assetCount).fill({}) as any,
    stories: [],
  }
}

// 정오 UTC — 어느 시간대에서 돌려도 벽시계 날짜가 2026-05-30 이다.
const TODAY = new Date('2026-05-30T12:00:00Z')
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86400000).toISOString().slice(0, 10)

describe('decideMemoryPush', () => {
  it('연 단위 있고 오늘 아직 안 보냈으면 yearly 발송', () => {
    const d = decideMemoryPush({
      today: TODAY,
      groups: [grp({ kind: 'year', n: 1 }, 3)],
      lastYearly: null,
      lastMonthly: null,
    })
    expect(d.yearly).toEqual({ count: 3, interval: { kind: 'year', n: 1 } })
  })

  it('연 단위라도 오늘 이미 보냈으면 yearly 없음', () => {
    const d = decideMemoryPush({
      today: TODAY,
      groups: [grp({ kind: 'year', n: 1 }, 3)],
      lastYearly: daysAgo(0),
      lastMonthly: null,
    })
    expect(d.yearly).toBeNull()
  })

  it('월 단위 + 마지막 발송 8일 전 → monthly 발송(무작위 picker 주입)', () => {
    const d = decideMemoryPush(
      {
        today: TODAY,
        groups: [grp({ kind: 'month', n: 6 }, 2), grp({ kind: 'month', n: 1 }, 5)],
        lastYearly: null,
        lastMonthly: daysAgo(8),
      },
      () => 1, // 두 번째 월 그룹 선택
    )
    expect(d.monthly).toEqual({ count: 5, interval: { kind: 'month', n: 1 } })
  })

  it('월 단위라도 마지막 발송 3일 전이면 monthly 없음(throttle)', () => {
    const d = decideMemoryPush({
      today: TODAY,
      groups: [grp({ kind: 'month', n: 6 }, 2)],
      lastYearly: null,
      lastMonthly: daysAgo(3),
    })
    expect(d.monthly).toBeNull()
  })

  it('월 단위 처음(lastMonthly null) → 발송', () => {
    const d = decideMemoryPush(
      {
        today: TODAY,
        groups: [grp({ kind: 'month', n: 6 }, 2)],
        lastYearly: null,
        lastMonthly: null,
      },
      () => 0,
    )
    expect(d.monthly).toEqual({ count: 2, interval: { kind: 'month', n: 6 } })
  })
})

describe('decideMemoryPush — 오늘은 벽시계 날짜', () => {
  const original = process.env.TZ
  beforeEach(() => {
    process.env.TZ = 'Asia/Seoul'
  })
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  it('KST 00:30 에 오늘 이미 보낸 연 단위 추억을 다시 보내지 않는다', () => {
    // UTC 로는 아직 5월 29일 — 추억 목록은 벽시계 오늘(5월 30일)로 고른다.
    const d = decideMemoryPush({
      today: new Date('2026-05-29T15:30:00Z'),
      groups: [grp({ kind: 'year', n: 1 }, 3)],
      lastYearly: '2026-05-30',
      lastMonthly: null,
    })
    expect(d.yearly).toBeNull()
  })
})
