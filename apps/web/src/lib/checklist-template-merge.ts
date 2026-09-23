const key = (label: string): string => label.trim().toLocaleLowerCase()

/** 공백을 다듬고 빈 줄·중복을 버린다. 순서는 처음 나온 자리를 따른다. */
export function normalizeTemplateItems(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const label = raw.trim()
    if (!label || seen.has(key(label))) continue
    seen.add(key(label))
    out.push(label)
  }
  return out
}

/**
 * 템플릿을 불러올 때 지금 목록에 **덧붙일** 항목. 이미 적어 둔 것은 건너뛴다 — 불러오기가
 * 사용자가 손으로 넣은 것을 덮거나 같은 준비물을 두 번 만들면 안 된다.
 */
export function mergeTemplateItems(
  existing: readonly string[],
  template: readonly string[],
): string[] {
  const have = new Set(existing.map(key))
  return normalizeTemplateItems(template).filter((label) => !have.has(key(label)))
}
