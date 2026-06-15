export type StoryPushDecision = 'send' | 'defer'

/**
 * diary.created 푸시 게이트. 스토리는 사진이 아직 `uploading`/`processing` 인 동안에도
 * 생성되므로(createStoryEntry 가 상태를 느슨히 허용), 푸시가 사진보다 먼저 나가
 * 수신자가 열면 "처리중"만 보였다. 모든 사진이 settle(=ready 또는 failed)될 때까지
 * 발송을 미룬다. 단 cap 을 넘기면(처리가 오래 걸리거나 멈춘 경우) 푸시를 잃지 않도록
 * 그냥 보낸다(조용한 실패 금지 — 푸시 유실보다 약간 이른 푸시가 낫다).
 */
export function decideStoryPush(input: {
  /** 스토리에 연결된 사진 수 */
  total: number
  /** ready 또는 failed 로 settle 된 사진 수 */
  settled: number
  /** 지금까지 미룬 횟수 */
  attempts: number
  maxAttempts: number
}): StoryPushDecision {
  if (input.total === 0) return 'send'
  if (input.settled >= input.total) return 'send'
  if (input.attempts >= input.maxAttempts) return 'send'
  return 'defer'
}
