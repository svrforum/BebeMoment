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
 * 아기 나이 버킷 라벨.
 *   출산 전     → "D-N" (출산 예정일까지 남은 일수, 태아기 기록)
 *   0..98일  → "생후 N일" (N = daysBetween + 1, 한국 관례)
 *   99일     → "100일" (daysBetween + 1 이 100인 시점)
 *   100일+   → "생후 N개월"
 *   정확히 N주년 당일 → "1주년 (돌)" / "N주년"
 */
export function bucketLabel(birthDate: Date, at: Date): string {
  const elapsed = daysBetween(birthDate, at)
  if (elapsed < 0) return `D-${-elapsed}`

  const day = elapsed + 1
  if (day <= 99) return `생후 ${day}일`
  if (day === 100) return '100일'

  const months = monthsBetween(birthDate, at)
  const years = Math.floor(months / 12)

  if (years >= 1) {
    const anniversary = months % 12 === 0 && at.getDate() === birthDate.getDate()
    if (anniversary) return years === 1 ? '1주년 (돌)' : `${years}주년`
  }

  return `생후 ${months}개월`
}
