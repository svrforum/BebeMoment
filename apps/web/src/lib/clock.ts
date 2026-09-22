export type ClockParts = {
  period: 'am' | 'pm'
  /** 12시간제 시(1-12). 0시와 12시는 둘 다 12 다. */
  hour12: number
  /** 두 자리로 채운 분. */
  minute2: string
}

/**
 * 분(0-1439)을 12시간제 부품으로 쪼갠다.
 *
 * 왜 Intl 로 바로 문자열을 만들지 않나: `toLocaleTimeString(locale, { hour:'numeric' })` 의
 * 한국어 오전/오후 표기가 ICU 버전마다 달라, 이 앱에서는 서버(Node)가 "AM 10:00" 을,
 * 브라우저가 "오전 10:00" 을 내놓는다. 시각을 SSR 로 찍으면 하이드레이션이 어긋나고 React 가
 * 그 트리를 통째로 다시 그린다. 숫자만 여기서 만들고 오전/오후 낱말은 카탈로그가 붙인다.
 */
export function clockParts(minute: number): ClockParts {
  const wrapped = ((Math.trunc(minute) % 1440) + 1440) % 1440
  const hour24 = Math.floor(wrapped / 60)
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return {
    period: hour24 < 12 ? 'am' : 'pm',
    hour12,
    minute2: String(wrapped % 60).padStart(2, '0'),
  }
}
