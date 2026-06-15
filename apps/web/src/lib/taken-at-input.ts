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
