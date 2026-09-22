import { reminderKey } from '@/components/schedule/form-model'
import type { ReminderSpec } from '@/server/schedule/reminder-time'

export type ReminderChip = { key: string; spec: ReminderSpec; selected: boolean }

/**
 * 칩 하나가 알림 하나이고, 칩이 켜져 있으면 그 알림이 걸려 있다는 뜻이다. 프리셋은 걸려
 * 있든 아니든 늘 자리에 있고, 직접 넣은 값은 켜진 칩으로 뒤에 붙는다 — 같은 모양이라야
 * 같은 자리에서 끌 수 있다. 같은 알림이 두 번 들어와도 칩은 하나다(칩 key 가 겹치면
 * 목록이 엉킨다).
 */
export function reminderChips(presets: ReminderSpec[], selected: ReminderSpec[]): ReminderChip[] {
  const chosen = new Set(selected.map(reminderKey))
  const seen = new Set<string>()
  const chips: ReminderChip[] = []
  for (const spec of presets) {
    const key = reminderKey(spec)
    if (seen.has(key)) continue
    seen.add(key)
    chips.push({ key, spec, selected: chosen.has(key) })
  }
  for (const spec of selected) {
    const key = reminderKey(spec)
    if (seen.has(key)) continue
    seen.add(key)
    chips.push({ key, spec, selected: true })
  }
  return chips
}
