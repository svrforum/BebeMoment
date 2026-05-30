export type MemoryInterval = { kind: 'year' | 'month'; n: number }

/**
 * `date` 가 `today` 기준 "같은 일(日)이면서 정확히 N개월/N년 전"이면 간격을 반환, 아니면 null.
 * UTC 날짜 기준(takenAt = wall-clock-as-UTC 와 정합). 일이 같고 과거인 whole-month 차이만 추억.
 * 연 배수(12·24…)는 year, 그 외는 month(13개월 전 등 — 아기 나이식 표현이 자연스러움).
 */
export function memoryInterval(today: Date, date: Date): MemoryInterval | null {
  if (date.getUTCDate() !== today.getUTCDate()) return null
  const months =
    (today.getUTCFullYear() - date.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - date.getUTCMonth())
  if (months <= 0) return null
  return months % 12 === 0 ? { kind: 'year', n: months / 12 } : { kind: 'month', n: months }
}

export function intervalLabel(interval: MemoryInterval): string {
  return interval.kind === 'year' ? `${interval.n}년 전 오늘` : `${interval.n}개월 전 오늘`
}

/** 가까운 과거가 먼저 오도록 정렬할 때 쓰는 개월 환산값. */
export function intervalMonths(interval: MemoryInterval): number {
  return interval.kind === 'year' ? interval.n * 12 : interval.n
}
