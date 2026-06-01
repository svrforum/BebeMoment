import type { BackupType } from './manifest'

export type ScheduleSettings = {
  enabled: boolean
  hour: number
  interval: 'daily' | 'weekly'
  weekday: number
  fullEvery: number
}

export const DEFAULT_SCHEDULE: ScheduleSettings = {
  enabled: false,
  hour: 4,
  interval: 'daily',
  weekday: 0,
  fullEvery: 7,
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 매시간 틱에서 "지금 백업을 돌릴지·전체인지 증분인지" 결정한다(순수 함수). 로컬 시각 기준
 * (digest 스캔과 동일). 같은 날 중복 실행은 lastRunDay 로 막는다. fullEvery 회마다 1번 전체.
 */
export function decideScheduledBackup(args: {
  settings: ScheduleSettings
  now: Date
  lastRunDay: string | null
  runCount: number
}): { run: boolean; type: BackupType } {
  const { settings, now } = args
  if (!settings.enabled) return { run: false, type: 'incr' }
  if (now.getHours() !== settings.hour) return { run: false, type: 'incr' }
  if (settings.interval === 'weekly' && now.getDay() !== settings.weekday) {
    return { run: false, type: 'incr' }
  }
  if (args.lastRunDay === dayKey(now)) return { run: false, type: 'incr' }

  const next = args.runCount + 1
  const every = settings.fullEvery > 0 ? settings.fullEvery : 1
  const type: BackupType = (next - 1) % every === 0 ? 'full' : 'incr'
  return { run: true, type }
}
