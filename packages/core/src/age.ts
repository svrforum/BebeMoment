const MS_PER_DAY = 24 * 60 * 60 * 1000

function toUTCDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function daysBetween(from: Date, to: Date): number {
  const a = toUTCDate(from).getTime()
  const b = toUTCDate(to).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}

export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return Math.max(0, months)
}

/**
 * 아기 나이 버킷. 문자열이 아니라 구조로 돌려준다 — core 는 web·media·워커가 함께 쓰는
 * 패키지라 next-intl 을 못 쓰고, 여기서 문장을 만들면 영어 UI 에도 한국어가 그대로 샜다.
 * 표기는 호출부(카탈로그 `age` 네임스페이스)가 맡는다.
 */
export type AgeBucket =
  /** 출산 전 — n = 출산 예정일까지 남은 일수(양수). */
  | { kind: 'dday'; n: number }
  /** 0..98일 경과 — n = 경과일 + 1 (한국 관례로 태어난 날이 1일). */
  | { kind: 'days'; n: number }
  /** n = 100. `days` 의 n 이 100 이 되는 하루. */
  | { kind: 'hundredDays'; n: number }
  /** 100일 초과 · 만 1년 미만 — n = 개월수. */
  | { kind: 'months'; n: number }
  /** 만 1년 이상 — n = 개월수, years = 만 나이(97개월이 만 몇 살인지 직관적이게 병기). */
  | { kind: 'monthsWithYears'; n: number; years: number }
  /** 정확히 n주년 당일. */
  | { kind: 'anniversary'; n: number }

export function ageBucket(birthDate: Date, at: Date): AgeBucket {
  const elapsed = daysBetween(birthDate, at)
  if (elapsed < 0) return { kind: 'dday', n: -elapsed }

  const day = elapsed + 1
  if (day <= 99) return { kind: 'days', n: day }
  if (day === 100) return { kind: 'hundredDays', n: 100 }

  const months = monthsBetween(birthDate, at)
  const years = Math.floor(months / 12)

  if (years >= 1) {
    const anniversary = months % 12 === 0 && at.getDate() === birthDate.getDate()
    if (anniversary) return { kind: 'anniversary', n: years }
  }

  // years = floor(months/12) 가 곧 만 나이(monthsBetween 이 생일 경과를 이미 반영).
  return years >= 1 ? { kind: 'monthsWithYears', n: months, years } : { kind: 'months', n: months }
}
