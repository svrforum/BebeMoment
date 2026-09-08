type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * 날짜 공유의 공개 메타 — "9월 4일 · 사진 12장 · 이야기 2개". 페이지 헤더와 og:description 에 그대로
 * 나가는 문자열이라 **아기 정보를 넣지 않는다**: 날짜 옆에 D+N 을 붙이면 두 값에서 생일이 바로
 * 계산된다(공개 링크가 생일을 새던 문제). 타임라인 헤더의 D+N 은 로그인 뒤에만 보인다.
 */
export function formatDayShareMeta(
  input: { date: string; locale: string; photoCount: number; storyCount: number },
  t: Translate,
): string {
  const at = new Date(`${input.date}T00:00:00.000Z`)
  const monthDay = new Intl.DateTimeFormat(input.locale, {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(at)
  return [
    monthDay,
    t('photoset.metaCount', { n: input.photoCount }),
    input.storyCount > 0 ? t('photoset.storyCount', { n: input.storyCount }) : null,
  ]
    .filter((s): s is string => Boolean(s))
    .join(' · ')
}
