import type { MemoryInterval } from '@bebe/core'
import type { MemoryGroup } from './list'

export type MemoryPushDecision = {
  yearly: { count: number; interval: string } | null
  monthly: { count: number; interval: string } | null
}

function bareLabel(iv: MemoryInterval): string {
  return iv.kind === 'year' ? `${iv.n}년` : `${iv.n}개월`
}

function groupCount(g: MemoryGroup): number {
  return g.assets.length + g.stories.length
}

function daysBetween(aStr: string, bStr: string): number {
  return Math.round((Date.parse(`${bStr}T00:00:00Z`) - Date.parse(`${aStr}T00:00:00Z`)) / 86400000)
}

const MONTHLY_THROTTLE_DAYS = 7

/**
 * 오늘 추억 그룹과 마지막 발송일로 추억 푸시 발송 여부를 결정한다(순수 함수).
 * - 연 단위: 있으면 오늘 아직 안 보냈을 때만(같은 날 중복 방지).
 * - 월 단위: 마지막 월 단위 발송으로부터 7일 이상일 때만, 그중 하나를 `pick` 으로 선택
 *   (기본 무작위, 테스트는 picker 주입으로 결정적). 대략 주 1회 "가끔 랜덤" 동작.
 */
export function decideMemoryPush(
  args: {
    today: Date
    groups: MemoryGroup[]
    lastYearly: string | null
    lastMonthly: string | null
  },
  pick: (n: number) => number = (n) => Math.floor(Math.random() * n),
): MemoryPushDecision {
  const todayStr = args.today.toISOString().slice(0, 10)
  const yearlyGroups = args.groups.filter((g) => g.interval.kind === 'year')
  const monthlyGroups = args.groups.filter((g) => g.interval.kind === 'month')

  let yearly: MemoryPushDecision['yearly'] = null
  const topYearly = yearlyGroups[0] // 정렬상 가장 먼 과거(가장 큰 N년)
  if (topYearly && args.lastYearly !== todayStr) {
    yearly = { count: groupCount(topYearly), interval: bareLabel(topYearly.interval) }
  }

  let monthly: MemoryPushDecision['monthly'] = null
  const throttleOk =
    !args.lastMonthly || daysBetween(args.lastMonthly, todayStr) >= MONTHLY_THROTTLE_DAYS
  if (monthlyGroups.length > 0 && throttleOk) {
    const idx = Math.min(Math.max(pick(monthlyGroups.length), 0), monthlyGroups.length - 1)
    const g = monthlyGroups[idx]
    if (g) monthly = { count: groupCount(g), interval: bareLabel(g.interval) }
  }

  return { yearly, monthly }
}
