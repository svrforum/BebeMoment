const CATALOG_KEY = /^[a-z][\w-]*(?:\.[\w-]+)+$/i

/**
 * zod 이슈 메시지를 `errors` 네임스페이스 **상대** 키로 바꾼다.
 *
 * 스키마 하나를 서버 액션과 API 라우트가 같이 쓰므로 메시지에는 카탈로그 **전체 경로**
 * (`errors.auth.passwordTooShort`)를 넣는다 — 액션 쪽(`with-action-log`)은 전체 경로를
 * 그대로 쓰고, 라우트 쪽 `errorJsonKey` 는 이미 `errors` 로 바인딩돼 있어 접두사를 떼야
 * 한다. 키 모양이 아니면(zod 기본 문구 등) 일반 검증 실패로 떨어뜨린다.
 */
export function errorKeyFromIssue(message: string | undefined): string {
  if (!message || !CATALOG_KEY.test(message)) return 'invalidInput'
  return message.startsWith('errors.') ? message.slice('errors.'.length) : message
}
