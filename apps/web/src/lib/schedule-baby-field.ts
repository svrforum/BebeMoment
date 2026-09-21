export type ScheduleBabyChoice = { id: string; name: string }

export type BabyFieldMode =
  /** 아기가 없으면 연결할 대상이 없다. */
  | { kind: 'hidden' }
  /** 한 명이면 고를 것이 없다 — 그 아기로 고정하고 이름만 보여준다. */
  | { kind: 'fixed'; babyId: string; name: string }
  /** 두 명 이상이면 고른다. */
  | { kind: 'choose' }

export function babyFieldMode(babies: ScheduleBabyChoice[]): BabyFieldMode {
  const only = babies[0]
  if (!only) return { kind: 'hidden' }
  if (babies.length === 1) return { kind: 'fixed', babyId: only.id, name: only.name }
  return { kind: 'choose' }
}

/**
 * 폼을 열 때 채울 아기 id. 한 명뿐이면 비워 둘 이유가 없으므로 그 아기로 고정한다.
 * 여러 명이거나 없으면 저장된 값을 그대로 쓴다(수정 화면에서 고른 것을 덮지 않는다).
 */
export function initialBabyId(babies: ScheduleBabyChoice[], stored: string | null): string {
  const mode = babyFieldMode(babies)
  if (mode.kind === 'fixed') return mode.babyId
  return stored ?? ''
}
