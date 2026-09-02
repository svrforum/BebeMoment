/**
 * 스토리에 속한 사진을 **사용자가 정한 순서**로 되돌린다.
 *
 * 타임라인은 하루 안에서도 최신 먼저(takenAt DESC)로 늘어놓는다. 스토리 사진은 대개 찍은
 * 순서대로 담기므로 그 화면에서는 정확히 뒤집혀 보였고, 스토리 상세는 지정 순서라 두 화면이
 * 서로 다른 순서를 보여줬다. 스토리에 담은 순서는 사용자가 의도적으로 정한 것이고 1번이
 * 대표이므로, 타임라인도 그 순서를 따른다.
 *
 * 스토리 묶음은 **원래 그 스토리가 나타나던 자리**에 그대로 둔다 — 날짜 사이 순서(최신 날이
 * 위)와 스토리에 속하지 않은 사진의 순서는 건드리지 않는다.
 */
export function applyStoryOrder<T extends { kind: 'asset' | 'story'; id: string }>(
  items: readonly T[],
  storyOf: ReadonlyMap<string, { storyId: string; order: number }>,
): T[] {
  // 스토리별로 이 목록에 있는 사진을 모아 지정 순서로 정렬해 둔다.
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    if (item.kind !== 'asset') continue
    const meta = storyOf.get(item.id)
    if (!meta) continue
    const list = grouped.get(meta.storyId)
    if (list) list.push(item)
    else grouped.set(meta.storyId, [item])
  }
  for (const [storyId, list] of grouped) {
    list.sort((a, b) => (storyOf.get(a.id)?.order ?? 0) - (storyOf.get(b.id)?.order ?? 0))
    grouped.set(storyId, list)
  }

  const emitted = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (item.kind !== 'asset') {
      out.push(item)
      continue
    }
    const meta = storyOf.get(item.id)
    if (!meta) {
      out.push(item)
      continue
    }
    if (emitted.has(meta.storyId)) continue
    emitted.add(meta.storyId)
    out.push(...(grouped.get(meta.storyId) ?? [item]))
  }
  return out
}
