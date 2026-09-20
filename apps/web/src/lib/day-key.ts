function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 사용자의 벽시계 기준 'YYYY-MM-DD'.
 *
 * `toISOString().slice(0,10)` 은 UTC 라서 KST 새벽(00:00~09:00)에는 어제가 나온다 —
 * 날짜 입력에 기본값으로 보여 주는 "오늘" 은 반드시 사용자가 보는 날짜여야 한다.
 */
export function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * UTC 기준 'YYYY-MM-DD'. `stories.entry_date` · `assets.taken_at` 처럼 벽시계 시각을
 * UTC 로 저장한 값을 다시 날짜로 읽을 때 쓴다(타임라인 group-by-day 와 같은 규칙).
 */
export function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * 'YYYY-MM-DD' 가 **실제로 존재하는 날짜**이고 오늘을 넘지 않는지.
 *
 * `<input type="date">` 는 비워질 수 있고(크롬의 ×, 안드로이드 피커), `max` 는 폼 제출을
 * 거칠 때만 강제된다 — 우리는 폼이 아니라 버튼으로 보낸다. 그대로 보내면 서버가 400 을
 * 주고, 컴포저의 실패 처리가 **이미 올라간 사진을 전부 휴지통으로 되돌린다**. 보내기 전에
 * 여기서 막는다.
 */
export function isSubmittableDayKey(day: string, today: string = localDayKey()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const parsed = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  // '2026-02-31' 은 Date 가 3월 3일로 굴려서 받아 준다 — 되돌려 찍어 같은지 본다.
  if (utcDayKey(parsed) !== day) return false
  return day <= today
}
