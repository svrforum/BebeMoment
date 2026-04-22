export type MilestoneCategory = 'motor' | 'language' | 'social' | 'cognitive' | 'life'

export type MilestonePreset = {
  key: string
  labelKo: string
  category: MilestoneCategory
  typicalAgeMonths: readonly [number, number]
}

export const MILESTONE_PRESETS: readonly MilestonePreset[] = [
  { key: 'first_smile', labelKo: '첫 웃음', category: 'social', typicalAgeMonths: [1, 2] },
  { key: 'neck_control', labelKo: '목 가누기', category: 'motor', typicalAgeMonths: [3, 4] },
  { key: 'rollover', labelKo: '뒤집기', category: 'motor', typicalAgeMonths: [4, 6] },
  { key: 'sit_unsupported', labelKo: '혼자 앉기', category: 'motor', typicalAgeMonths: [6, 8] },
  { key: 'crawl', labelKo: '기어다니기', category: 'motor', typicalAgeMonths: [7, 10] },
  { key: 'first_tooth', labelKo: '첫 이', category: 'life', typicalAgeMonths: [6, 10] },
  { key: 'stand_assisted', labelKo: '잡고 서기', category: 'motor', typicalAgeMonths: [9, 12] },
  { key: 'walk_assisted', labelKo: '잡고 걷기', category: 'motor', typicalAgeMonths: [10, 14] },
  { key: 'walk_unassisted', labelKo: '혼자 걷기', category: 'motor', typicalAgeMonths: [11, 16] },
  { key: 'first_word', labelKo: '첫 말', category: 'language', typicalAgeMonths: [10, 14] },
  { key: 'first_solid_food', labelKo: '첫 이유식', category: 'life', typicalAgeMonths: [4, 6] },
  { key: 'sleep_through', labelKo: '통잠', category: 'life', typicalAgeMonths: [3, 9] },
  { key: 'wave_bye', labelKo: '빠이빠이', category: 'social', typicalAgeMonths: [8, 12] },
  { key: 'clap', labelKo: '짝짜꿍', category: 'social', typicalAgeMonths: [8, 12] },
  { key: 'point', labelKo: '가리키기', category: 'cognitive', typicalAgeMonths: [10, 14] },
  {
    key: 'two_word_phrase',
    labelKo: '두 단어 말',
    category: 'language',
    typicalAgeMonths: [18, 24],
  },
  { key: 'run', labelKo: '뛰기', category: 'motor', typicalAgeMonths: [14, 20] },
  { key: 'stairs', labelKo: '계단 오르기', category: 'motor', typicalAgeMonths: [16, 24] },
  { key: 'brush_teeth', labelKo: '양치 흉내', category: 'life', typicalAgeMonths: [18, 30] },
  { key: 'potty_day', labelKo: '낮 기저귀 뗌', category: 'life', typicalAgeMonths: [20, 36] },
  { key: 'spoon_self', labelKo: '숟가락 혼자', category: 'life', typicalAgeMonths: [15, 24] },
  {
    key: 'draw_circle',
    labelKo: '동그라미 그리기',
    category: 'cognitive',
    typicalAgeMonths: [24, 36],
  },
  { key: 'name_colors', labelKo: '색깔 말하기', category: 'cognitive', typicalAgeMonths: [24, 36] },
  { key: 'first_trip', labelKo: '첫 여행', category: 'life', typicalAgeMonths: [0, 36] },
  { key: 'first_haircut', labelKo: '첫 이발', category: 'life', typicalAgeMonths: [6, 24] },
] as const

const byKey = new Map(MILESTONE_PRESETS.map((p) => [p.key, p]))

export function isValidPresetKey(key: string): boolean {
  return byKey.has(key)
}

export function getPreset(key: string): MilestonePreset | undefined {
  return byKey.get(key)
}
