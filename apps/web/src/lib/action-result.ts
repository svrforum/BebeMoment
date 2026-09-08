/**
 * 서버 액션의 결과 봉투. 예상된 거절(권한·검증·중복)은 던지지 않고 `ok:false` 로 돌려준다 —
 * React 는 프로덕션에서 액션이 던진 에러의 메시지를 지우고 digest 만 남기므로, 던지면
 * 사용자는 "문제가 생겼어요" 만 보고 서버에도 흔적이 없다. `errorKey` 는 메시지 카탈로그의
 * 전체 경로(`errors.asset.uploadDenied`)라 클라이언트가 자기 로케일로 번역한다.
 */
export type ActionFailure = {
  ok: false
  status: number
  errorKey: string
  /** 카탈로그 키가 아닌 서비스 메시지(예: `throw new Error('...')`)를 그대로 실어 보낼 때. */
  message?: string
}

export type ActionResult<T = void> = { ok: true; data: T } | ActionFailure

/** `useActionState` 폼 액션의 상태 — 성공은 redirect 로 떠나므로 실패만 남는다. */
export type FormActionState = ActionFailure | null

type Translator = {
  (key: string): string
  has: (key: string) => boolean
}

/** 클라이언트가 실패를 사람이 읽을 문장으로 — 카탈로그 키면 번역, 아니면 서버 메시지. */
export function actionErrorText(t: Translator, failure: ActionFailure): string {
  if (t.has(failure.errorKey)) return t(failure.errorKey)
  return failure.message ?? t('errors.badRequest')
}
