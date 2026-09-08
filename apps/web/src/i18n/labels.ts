import type { AgeBucket, MemoryInterval } from '@bebe/core'
import { MILESTONE_PRESETS, isValidPresetKey } from '@bebe/core'

/**
 * core 가 돌려주는 구조값을 문장으로 바꾸는 곳. core 는 web·media·워커 공용이라 next-intl 을
 * 못 쓰므로(§6.5) 표기는 전부 여기와 카탈로그가 맡는다.
 *
 * `t` 는 해당 네임스페이스로 바인딩된 번역 함수 — 요청 안에서는 `useTranslations`/
 * `getTranslations`, 요청 밖(위젯·워커)에서는 `getServerTranslator(locale, ns)`.
 */
export type LabelT = (key: string, values?: Record<string, string | number>) => string

/** 네임스페이스 `age`. */
export function formatAgeBucket(bucket: AgeBucket, t: LabelT): string {
  switch (bucket.kind) {
    case 'dday':
      return t('dday', { n: bucket.n })
    case 'days':
      return t('days', { n: bucket.n })
    case 'hundredDays':
      return t('hundredDays', { n: bucket.n })
    case 'months':
      return t('months', { n: bucket.n })
    case 'monthsWithYears':
      return t('monthsWithYears', { n: bucket.n, years: bucket.years })
    case 'anniversary':
      return t('anniversary', { n: bucket.n })
  }
}

/** 네임스페이스 `memories`. */
export function formatMemoryInterval(interval: MemoryInterval, t: LabelT): string {
  return interval.kind === 'year'
    ? t('intervalYear', { n: interval.n })
    : t('intervalMonth', { n: interval.n })
}

/**
 * 네임스페이스 `misc`. 모르는 키(카탈로그에서 사라진 옛 프리셋)는 next-intl 이 키 경로를
 * 그대로 돌려주므로 화면에 `milestone.presets.…` 가 뜬다 — 그럴 땐 키 자체를 보여준다.
 */
export function milestonePresetLabel(presetKey: string, t: LabelT): string {
  return isValidPresetKey(presetKey) ? t(`milestone.presets.${presetKey}`) : presetKey
}

/** 네임스페이스 `misc`. 검색이 라벨로 프리셋을 찾을 때 쓰는 키→라벨 맵. */
export function milestonePresetLabels(t: LabelT): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of MILESTONE_PRESETS) out[p.key] = milestonePresetLabel(p.key, t)
  return out
}
