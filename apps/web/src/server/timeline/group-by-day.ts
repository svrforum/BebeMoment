import { DEFAULT_LOCALE } from '@/i18n/request'
import { type LabelT, formatAgeBucket } from '@/i18n/labels'
import { getServerTranslator } from '@/i18n/translator'
import { ageBucket } from '@bebe/core'
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
 *   - bucketLabel: 나이 버킷 ("생후 47일" / "100일" / "1주년 (돌)" 등). 표기는 카탈로그의
 *                `age` 네임스페이스가 만든다 — 호출부가 요청 로케일 번역기를 넘기면 그
 *                로케일로, 안 넘기면 기본 로케일로 만든다.
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
  durationMs?: number | null
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

/**
 * `t` 는 `age` 네임스페이스 번역기. 요청 안에서 부르면 `getTranslations('age')` 를 넘겨
 * 사용자의 로케일로 나이 버킷을 쓰고, 안 넘기면 기본 로케일로 쓴다(요청 컨텍스트가 없는
 * 호출부용 — 여기서 쿠키를 읽을 수는 없다).
 */
export function groupAssetsByDay(
  assets: DayAssetLike[],
  birthDate: Date | null,
  t: LabelT = getServerTranslator(DEFAULT_LOCALE, 'age'),
): DayGroup[] {
  // 최신 일자 먼저. **하루 안에서는 받은 순서를 그대로 둔다** — 호출부(merged-list)가
  // 스토리에 담은 순서를 이미 반영해 넘기는데, 여기서 ts desc 로 다시 정렬하면 그게 통째로
  // 되돌아가 스토리 사진이 또 역순으로 보인다. JS sort 는 안정적이라 일자 키로만 정렬하면
  // 같은 날 안의 순서는 보존된다.
  const sorted = [...assets].sort((a, b) => utcDayKey(b.ts).localeCompare(utcDayKey(a.ts)))

  const groups: DayGroup[] = []
  let current: DayGroup | null = null

  for (const a of sorted) {
    const key = utcDayKey(a.ts)
    if (!current || current.dateKey !== key) {
      current = {
        dateKey: key,
        dateLabel: utcDayLabel(a.ts),
        // For pre-birth dates the bucket is 'dday' — the same string as the
        // D-day chip — so suppress it then to avoid showing the same string
        // twice in the bucket header. Post-birth labels are meaningfully
        // different and stay.
        bucketLabel: (() => {
          if (!birthDate) return null
          const days = babyDaysDiff(birthDate, a.ts)
          return days < 0 ? null : formatAgeBucket(ageBucket(birthDate, a.ts), t)
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
