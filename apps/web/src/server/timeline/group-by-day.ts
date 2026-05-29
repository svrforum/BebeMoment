import { bucketLabel } from '@bebe/core'
import type { AssetUrls } from '@bebe/media-client'

/**
 * Per-UTC-day grouping for the timeline grid.
 *
 * takenAt 은 CLAUDE.md / takenat-and-video-pipeline 메모리대로 "벽시계 시각을
 * UTC 로 저장" 한다 (wall-clock-as-UTC). 그래서 d.getUTCFullYear/Month/Date 로
 * 잘라야 캘린더 셀과 정합. 로컬 시각 기반 분리는 timezone 따라 같은 사진이
 * 다른 날로 흘러가서 금지.
 *
 * 각 그룹은 다음을 가진다:
 *   - dateKey:   "YYYY-MM-DD" (UTC 일자)
 *   - dateLabel: "2026.05.27" (사용자가 본 라벨 — locale-agnostic)
 *   - bucketLabel: 나이 버킷 ("생후 47일" / "100일" / "1주년 (돌)" 등)
 *   - babyDays:  birthDate 와의 일수(음수=D-, 0=D-Day, 양수=D+) — 컴포넌트에서
 *                포맷팅. null 이면 baby 가 없는 가족.
 *   - assets:    그날의 자산
 */
export type DayAssetLike = {
  id: string
  publicNo: number
  ts: Date
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  kind: 'image' | 'video'
  urls: AssetUrls | null
}

export type DayGroup = {
  dateKey: string
  dateLabel: string
  bucketLabel: string | null
  babyDays: number | null
  assets: DayAssetLike[]
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function utcDayKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function utcDayLabel(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * birthDate 와 임의의 시각 사이의 UTC 일수 차이. birthDate 도 wall-clock-as-UTC
 * 가정 — `new Date('2026-02-20')` 같은 ISO 일자 문자열은 `getUTCDate` 안전.
 */
export function babyDaysDiff(birthDate: Date, at: Date): number {
  const a = utcMidnight(birthDate).getTime()
  const b = utcMidnight(at).getTime()
  return Math.round((b - a) / MS_PER_DAY)
}

export function groupAssetsByDay(assets: DayAssetLike[], birthDate: Date | null): DayGroup[] {
  // 최신 일자 먼저. 같은 날 안에서는 ts desc 로 안정 정렬해 그리드 순서 보장.
  const sorted = [...assets].sort((a, b) => b.ts.getTime() - a.ts.getTime())

  const groups: DayGroup[] = []
  let current: DayGroup | null = null

  for (const a of sorted) {
    const key = utcDayKey(a.ts)
    if (!current || current.dateKey !== key) {
      current = {
        dateKey: key,
        dateLabel: utcDayLabel(a.ts),
        // For pre-birth dates bucketLabel returns "D-N" — same as the D-day
        // chip — so suppress it then to avoid showing the same string twice
        // in the bucket header. Post-birth labels ("생후 N일" / "100일" /
        // "N주년") are meaningfully different and stay.
        bucketLabel: (() => {
          if (!birthDate) return null
          const days = babyDaysDiff(birthDate, a.ts)
          return days < 0 ? null : bucketLabel(birthDate, a.ts)
        })(),
        babyDays: birthDate ? babyDaysDiff(birthDate, a.ts) : null,
        assets: [],
      }
      groups.push(current)
    }
    current.assets.push(a)
  }
  return groups
}

/**
 * D-day 라벨 포맷팅. CLAUDE.md 가 정한 컨벤션:
 *   days <  0  → 'D' + days   (예: -30 → 'D-30')
 *   days === 0 → 'D-Day'
 *   days >  0  → 'D+' + days   (예: 97 → 'D+97')
 */
export function formatDDay(days: number): string {
  if (days === 0) return 'D-Day'
  if (days < 0) return `D${days}`
  return `D+${days}`
}
