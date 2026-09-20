export type GrowthRowBaby = { id: string; name: string }

export type GrowthSettingsRow = { href: string; label: string }

export type GrowthRowLabels = {
  label: () => string
  labelForBaby: (name: string) => string
}

/** 아기가 하나면 이름 없는 행 하나, 둘 이상이면 아기마다 한 행. 없으면 갈 곳이 없으니 빈 목록. */
export function growthSettingsRows(
  babies: GrowthRowBaby[],
  labels: GrowthRowLabels,
): GrowthSettingsRow[] {
  const href = (baby: GrowthRowBaby) => `/babies/${baby.id}/growth`
  if (babies.length === 0) return []
  const only = babies[0]
  if (babies.length === 1 && only) return [{ href: href(only), label: labels.label() }]
  return babies.map((baby) => ({ href: href(baby), label: labels.labelForBaby(baby.name) }))
}
