export function formatLastValue(
  value: number | null,
  measuredAt: Date,
  unit: string,
): string | null {
  if (value == null) return null
  const month = measuredAt.getUTCMonth() + 1
  const day = measuredAt.getUTCDate()
  return `${value}${unit} (${month}/${day})`
}
