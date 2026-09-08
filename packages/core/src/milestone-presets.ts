export type MilestoneCategory = 'motor' | 'language' | 'social' | 'cognitive' | 'life'

/**
 * 프리셋은 **키와 수치만** 갖는다. 라벨("첫 웃음")은 카탈로그(`misc.milestone.presets.<key>`)
 * 에 있다 — core 는 web·media·워커 공용이라 next-intl 을 못 쓰고, 여기 문자열을 두면 영어
 * UI 에도 한국어가 그대로 나온다.
 */
export type MilestonePreset = {
  key: string
  category: MilestoneCategory
  typicalAgeMonths: readonly [number, number]
}

export const MILESTONE_PRESETS: readonly MilestonePreset[] = [
  { key: 'first_smile', category: 'social', typicalAgeMonths: [1, 2] },
  { key: 'neck_control', category: 'motor', typicalAgeMonths: [3, 4] },
  { key: 'rollover', category: 'motor', typicalAgeMonths: [4, 6] },
  { key: 'sit_unsupported', category: 'motor', typicalAgeMonths: [6, 8] },
  { key: 'crawl', category: 'motor', typicalAgeMonths: [7, 10] },
  { key: 'first_tooth', category: 'life', typicalAgeMonths: [6, 10] },
  { key: 'stand_assisted', category: 'motor', typicalAgeMonths: [9, 12] },
  { key: 'walk_assisted', category: 'motor', typicalAgeMonths: [10, 14] },
  { key: 'walk_unassisted', category: 'motor', typicalAgeMonths: [11, 16] },
  { key: 'first_word', category: 'language', typicalAgeMonths: [10, 14] },
  { key: 'first_solid_food', category: 'life', typicalAgeMonths: [4, 6] },
  { key: 'sleep_through', category: 'life', typicalAgeMonths: [3, 9] },
  { key: 'wave_bye', category: 'social', typicalAgeMonths: [8, 12] },
  { key: 'clap', category: 'social', typicalAgeMonths: [8, 12] },
  { key: 'point', category: 'cognitive', typicalAgeMonths: [10, 14] },
  { key: 'two_word_phrase', category: 'language', typicalAgeMonths: [18, 24] },
  { key: 'run', category: 'motor', typicalAgeMonths: [14, 20] },
  { key: 'stairs', category: 'motor', typicalAgeMonths: [16, 24] },
  { key: 'brush_teeth', category: 'life', typicalAgeMonths: [18, 30] },
  { key: 'potty_day', category: 'life', typicalAgeMonths: [20, 36] },
  { key: 'spoon_self', category: 'life', typicalAgeMonths: [15, 24] },
  { key: 'draw_circle', category: 'cognitive', typicalAgeMonths: [24, 36] },
  { key: 'name_colors', category: 'cognitive', typicalAgeMonths: [24, 36] },
  { key: 'first_trip', category: 'life', typicalAgeMonths: [0, 36] },
  { key: 'first_haircut', category: 'life', typicalAgeMonths: [6, 24] },
] as const

const byKey = new Map(MILESTONE_PRESETS.map((p) => [p.key, p]))

export function isValidPresetKey(key: string): boolean {
  return byKey.has(key)
}

export function getPreset(key: string): MilestonePreset | undefined {
  return byKey.get(key)
}

/**
 * 라벨에 검색어가 든 프리셋 키들.
 *
 * 프리셋 기록은 `preset_key` 만 저장하고 라벨은 카탈로그에만 있다. 그래서 검색이 DB
 * 컬럼(customLabel·note)만 뒤지면 사용자가 화면에서 본 이름으로는 절대 못 찾았다.
 * 라벨은 로케일마다 다르므로 호출부가 번역된 `labels`(키→라벨)를 넘긴다.
 */
export function presetKeysMatching(
  query: string,
  labels: Readonly<Record<string, string>> = {},
): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return MILESTONE_PRESETS.filter(
    (p) => (labels[p.key] ?? '').toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
  ).map((p) => p.key)
}
