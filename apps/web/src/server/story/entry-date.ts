import { ServiceError } from '../error'

/**
 * 하루치 여유 — 사용자의 로컬 '오늘' 이 UTC 기준으로 내일일 수 있다(동아시아는 +9h).
 * 그 정도는 통과시키고 그보다 먼 미래만 막는다.
 */
const FUTURE_SLACK_MS = 86400_000

/**
 * 'YYYY-MM-DD' → UTC 자정 Date. 스토리 작성·편집이 같은 규칙을 쓰도록 한 곳에 둔다
 * (편집에만 가드가 없어 미래 날짜가 통과하던 회귀).
 */
export function parseEntryDate(day: string): Date {
  const date = new Date(`${day}T00:00:00Z`)
  // zod 는 모양(\d{4}-\d{2}-\d{2})만 본다 — '2026-02-31' 은 통과해 Invalid Date 가 되고,
  // 그대로 prisma 에 넘어가 내부 오류 메시지가 사용자에게 나간다.
  if (Number.isNaN(date.getTime())) {
    throw new ServiceError(400, 'story.entryDateInvalid')
  }
  if (date.getTime() > Date.now() + FUTURE_SLACK_MS) {
    throw new ServiceError(400, 'story.entryDateFuture')
  }
  return date
}
