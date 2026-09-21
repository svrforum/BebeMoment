/**
 * 네비 항목이 켜져 있는지. 하위 경로(`/calendar/todo`)에서도 부모 탭을 켠 채로 둔다 —
 * 정확히 일치만 보면 할 일 탭에서 캘린더 탭이 꺼져 어디에 있는지 알 수 없다.
 */
export function isNavActive(
  pathname: string | null | undefined,
  href: string,
  opts?: { inDateView?: boolean },
): boolean {
  // 캘린더에서 날짜를 눌러 들어간 `/timeline?date=` 는 캘린더 맥락이다.
  if (opts?.inDateView) return href === '/calendar'
  if (!pathname) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}
