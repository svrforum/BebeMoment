/**
 * web-push 워커가 매 잡 전에 호출하는 VAPID 키 재로딩 판정.
 *
 * 관리자가 키를 재생성하면(=공개키 변경) 자동 복구하되, **같은 공개키엔 재시도하지
 * 않는다** — 복호화 불가 키(SECRET_KEY 회전 후)로 한 번 실패한 걸 매 잡마다 다시
 * 시도해 로그를 도배하던 회귀 방지. 호출부는 시도(성공/실패)할 때마다 그 공개키를
 * `lastAttemptedPublic` 으로 기록해 다음 비교 기준으로 삼는다.
 */
export function shouldAttemptVapidReload(
  latestPublic: string | null | undefined,
  lastAttemptedPublic: string,
): boolean {
  if (!latestPublic) return false
  return latestPublic !== lastAttemptedPublic
}
