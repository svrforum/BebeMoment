import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHEDULE, decideScheduledBackup } from './schedule'

const at = (hour: number, weekday = 1): Date => {
  // 2026-06-01 was a Monday(weekday 1). Pick days to hit weekdays.
  const base = new Date(2026, 5, weekday, hour, 0, 0) // month 5 = June; date=weekday gives varying weekday
  return base
}

describe('decideScheduledBackup', () => {
  const en = { ...DEFAULT_SCHEDULE, enabled: true, hour: 4, fullEvery: 3 }

  it('disabled → never runs', () => {
    expect(
      decideScheduledBackup({
        settings: { ...en, enabled: false },
        now: at(4),
        lastRunDay: null,
        runCount: 0,
      }).run,
    ).toBe(false)
  })

  it('wrong hour → no run', () => {
    expect(
      decideScheduledBackup({ settings: en, now: at(3), lastRunDay: null, runCount: 0 }).run,
    ).toBe(false)
  })

  it('right hour, not run today → run; first run is full', () => {
    const d = decideScheduledBackup({ settings: en, now: at(4), lastRunDay: null, runCount: 0 })
    expect(d.run).toBe(true)
    expect(d.type).toBe('full')
  })

  it('already ran today → no run', () => {
    const now = at(4)
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(decideScheduledBackup({ settings: en, now, lastRunDay: key, runCount: 5 }).run).toBe(
      false,
    )
  })

  it('fullEvery rotation: runs 0,3,6 are full; others incr', () => {
    const t = (runCount: number) =>
      decideScheduledBackup({ settings: en, now: at(4), lastRunDay: null, runCount }).type
    expect(t(0)).toBe('full')
    expect(t(1)).toBe('incr')
    expect(t(2)).toBe('incr')
    expect(t(3)).toBe('full')
    expect(t(6)).toBe('full')
  })

  it('weekly: only runs on the configured weekday', () => {
    const weekly = { ...en, interval: 'weekly' as const, weekday: 0 }
    // find a Sunday(0) and a non-Sunday at hour 4
    const sunday = new Date(2026, 5, 7, 4, 0, 0) // 2026-06-07 is a Sunday
    const monday = new Date(2026, 5, 8, 4, 0, 0)
    expect(sunday.getDay()).toBe(0)
    expect(
      decideScheduledBackup({ settings: weekly, now: sunday, lastRunDay: null, runCount: 0 }).run,
    ).toBe(true)
    expect(
      decideScheduledBackup({ settings: weekly, now: monday, lastRunDay: null, runCount: 0 }).run,
    ).toBe(false)
  })
})
