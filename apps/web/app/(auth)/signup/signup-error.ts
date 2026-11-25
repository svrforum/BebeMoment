const USERNAME_STEP_ERRORS = ['usernameTaken', 'usernameInvalid', 'usernameRequired'] as const

export type UsernameErrorKey = (typeof USERNAME_STEP_ERRORS)[number]

export type SignupRejection = {
  /** 아이디 중복 — 자동으로 지은 아이디라면 새 접미사로 다시 보낸다. */
  usernameTaken: boolean
  /** 아이디 단계에서 고칠 거절 — 그 단계로 되돌아간다. */
  usernameStep: boolean
}

/**
 * 가입 API 는 거절 사유를 키가 아니라 요청 로케일로 번역한 문장으로 돌려준다. 그래서 화면과 같은
 * 로케일의 `errors.auth` 문장(`tErr`)과 맞춰 본다 — 한 언어의 문장과 비교하면 다른 언어 화면에서
 * 자동 아이디 재시도와 아이디 단계 복귀가 조용히 빗나간다.
 */
export function classifySignupError(
  message: string,
  tErr: (key: UsernameErrorKey) => string,
): SignupRejection {
  return {
    usernameTaken: message === tErr('usernameTaken'),
    usernameStep: USERNAME_STEP_ERRORS.some((key) => message === tErr(key)),
  }
}
