export type ReminderSpec =
  | { kind: 'lead'; leadMinutes: number }
  | { kind: 'dayBefore'; daysBefore: number; atMinute: number }

/** month 는 1-12. 벽시계 부품이라 시간대에 의존하지 않는다. */
export type WallClock = { year: number; month: number; day: number; minute: number }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parts(day: string): [number, number, number] {
  if (!DATE_RE.test(day)) throw new Error(`invalid date: ${day}`)
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))]
}

function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function shiftDays(y: number, m: number, d: number, shift: number, minute: number): WallClock {
  const at = new Date(Date.UTC(y, m - 1, d + shift))
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth() + 1,
    day: at.getUTCDate(),
    minute,
  }
}

/**
 * 구간에 드는 회차의 시작 날짜들. 반복이 없으면 0개 또는 1개.
 * 2월 29일 반복은 평년에 2월 28일로 맞춘다 — 그 해에 없는 날짜를 그냥 건너뛰면
 * 4년에 한 번만 울리는 생일 알림이 된다.
 */
export function occurrenceDatesInRange(
  entry: { onDate: string; repeatYearly: boolean; repeatUntil: string | null },
  fromDate: string,
  toDate: string,
): string[] {
  const [sy, sm, sd] = parts(entry.onDate)
  if (!entry.repeatYearly) {
    return entry.onDate >= fromDate && entry.onDate <= toDate ? [entry.onDate] : []
  }
  const fromYear = Number(fromDate.slice(0, 4))
  const toYear = Number(toDate.slice(0, 4))
  const out: string[] = []
  for (let y = Math.max(fromYear, sy); y <= toYear; y++) {
    const day = Math.min(sd, daysInMonth(y, sm))
    const key = toKey(y, sm, day)
    if (key < fromDate || key > toDate) continue
    if (key < entry.onDate) continue
    if (entry.repeatUntil && key > entry.repeatUntil) continue
    out.push(key)
  }
  return out
}

/** 회차 시작에서 알림 시각을 벽시계로 계산한다. 종일 일정의 시작은 자정으로 본다. */
export function reminderWallClock(
  occurrenceOn: string,
  startMinute: number | null,
  spec: ReminderSpec,
): WallClock {
  const [y, m, d] = parts(occurrenceOn)
  if (spec.kind === 'lead') {
    const total = (startMinute ?? 0) - spec.leadMinutes
    const dayShift = Math.floor(total / 1440)
    const minute = ((total % 1440) + 1440) % 1440
    return shiftDays(y, m, d, dayShift, minute)
  }
  return shiftDays(y, m, d, -spec.daysBefore, spec.atMinute)
}

/**
 * 벽시계를 실제 순간으로. 인스턴스 시간대(컨테이너 로컬, TZ=Asia/Seoul)로 해석한다.
 * 시계가 앞으로 당겨져 그 시각이 없는 날이면 플랫폼 변환이 앞으로 밀어 주고,
 * 두 번 있는 날이면 이른 쪽을 고른다. 한국은 서머타임이 없어 현재는 해당 없음.
 */
export function wallClockToInstant(w: WallClock): Date {
  return new Date(w.year, w.month - 1, w.day, Math.floor(w.minute / 60), w.minute % 60, 0, 0)
}
