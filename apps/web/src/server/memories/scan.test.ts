import type { MemoryInterval } from '@bebe/core'
import { describe, expect, it } from 'vitest'
import type { MemoryGroup } from './list'
import { decideMemoryPush } from './scan'

// 카운트만 중요 — assets 길이로 count 가 정해지므로 더미 배열 길이만 맞춘다.
function grp(interval: MemoryInterval, assetCount: number): MemoryGroup {
  return {
    interval,
    label: 'x',
    // biome-ignore lint/suspicious/noExplicitAny: 테스트 더미 — 길이만 의미
    assets: Array(assetCount).fill({}) as any,
    stories: [],
  }
}

const TODAY = new Date('2026-05-30T00:00:00Z')
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86400000).toISOString().slice(0, 10)

describe('decideMemoryPush', () => {
  it('연 단위 있고 오늘 아직 안 보냈으면 yearly 발송', () => {
    const d = decideMemoryPush({
      today: TODAY,
      groups: [grp({ kind: 'year', n: 1 }, 3)],
      lastYearly: null,
      lastMonthly: null,
    })
    expect(d.yearly).toEqual({ count: 3, interval: '1년' })
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
    expect(d.monthly).toEqual({ count: 5, interval: '1개월' })
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
    expect(d.monthly).toEqual({ count: 2, interval: '6개월' })
  })
})
