// takenAt 은 촬영 벽시계 시각을 UTC 로 저장한다(타임라인 UTC-일자 버킷 정합 — 상세 표시도
// timeZone:'UTC'). 그래서 datetime-local 편집 입력도 UTC 벽시계로 다뤄야 표시와 일치하고,
// 날짜를 고쳐도 9시간 밀리지 않는다. 로컬 getter/`new Date(localString)` 를 쓰면 안 된다.

/** 저장된 ISO(UTC) → datetime-local 입력값 "YYYY-MM-DDTHH:mm" (UTC 벽시계). */
export function toUtcInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** datetime-local 입력값(UTC 벽시계) → 저장용 ISO(UTC). 초가 없으면 :00 보강. */
export function fromUtcInputValue(v: string): string {
  const withSeconds = v.length === 16 ? `${v}:00` : v
  return new Date(`${withSeconds}Z`).toISOString()
}

/**
 * 편집칸 값 → 저장할 ISO. 바뀌지 않았거나 비었으면 null. 입력칸은 분 단위라 초가 있는 저장값과
 * ISO 로 비교하면 늘 달라서, 날짜 줄을 눌렀다 떼기만 해도 초가 잘린 값이 '직접 고침'으로 저장됐다.
 */
export function editedTakenAt(initialISO: string, inputValue: string): string | null {
  if (!inputValue || inputValue === toUtcInputValue(initialISO)) return null
  return fromUtcInputValue(inputValue)
}
