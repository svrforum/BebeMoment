/**
 * 날짜 스크러버의 트랙 계산. 트랙은 사진이 있는 날을 위(최신)부터 같은 길이로 나눈다 —
 * 날짜 섹션이 날마다 최대 6장(접힘)이라 화면 높이도 날 수에 비례하기 때문.
 */

export type ScrubDay = { key: string; count: number }

export type MonthTick = {
  /** 'YYYY-MM' */
  month: string
  /** 트랙 위에서의 비율(0=맨 위). 그 달 첫 날 칸의 윗변. */
  fraction: number
  /** 첫 눈금이거나 해가 바뀌는 눈금 — 년도를 같이 적는다. */
  showYear: boolean
}

export function dayIndexAt(fraction: number, dayCount: number): number {
  if (dayCount <= 0) return 0
  const i = Math.floor(fraction * dayCount)
  return Math.min(dayCount - 1, Math.max(0, i))
}

export function fractionOfDay(index: number, dayCount: number): number {
  if (dayCount <= 0) return 0
  return (index + 0.5) / dayCount
}

/**
 * 달이 바뀌는 첫 날마다 눈금. 앞 눈금과 `minGap`(트랙 비율)보다 가까우면 건너뛰되, 해가
 * 바뀌는 눈금은 앞의 달 눈금을 밀어내고 남는다 — 몇 년치를 끌 때 년도가 길잡이다.
 */
export function monthTicks(days: ScrubDay[], minGap: number): MonthTick[] {
  const n = days.length
  const ticks: MonthTick[] = []
  let prevMonth: string | null = null
  for (let i = 0; i < n; i++) {
    const month = days[i]?.key.slice(0, 7)
    if (!month || month === prevMonth) continue
    const showYear = prevMonth === null || prevMonth.slice(0, 4) !== month.slice(0, 4)
    prevMonth = month
    const tick = { month, fraction: i / n, showYear }
    const last = ticks[ticks.length - 1]
    if (last && tick.fraction - last.fraction < minGap) {
      if (!tick.showYear || last.showYear) continue
      ticks.pop()
    }
    ticks.push(tick)
  }
  return ticks
}
