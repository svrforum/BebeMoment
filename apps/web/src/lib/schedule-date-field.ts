/**
 * 새 일정을 열 때 채워 둘 날짜(`YYYY-MM-DD`).
 *
 * 비워 두면 종일/시각 선택도 알림 프리셋도 통째로 숨어, 기본 상태에서는 알림을 걸 방법이
 * 아예 보이지 않는다. 날짜 칸에서 열면 그 날, + 버튼처럼 날짜 없이 열면 오늘로 시작한다 —
 * 날짜 없는 할 일은 시트 안의 '날짜 지우기' 로 언제든 만들 수 있다.
 */
export function initialOnDate(day: string | null | undefined, today: string): string {
  return day ? day : today
}
