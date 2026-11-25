import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '../../../messages/en.json'
import ko from '../../../messages/ko.json'
import { classifySignupError } from './signup-error'

function errorsAuth(messages: typeof ko | typeof en, locale: string): (key: string) => string {
  const t = createTranslator({ locale, messages, namespace: 'errors.auth' })
  return (key) => t(key as Parameters<typeof t>[0])
}

describe.each([
  ['ko', ko],
  ['en', en],
] as const)('classifySignupError (%s)', (locale, messages) => {
  // 서버(errorJson)는 요청 로케일로 번역한 문장을 돌려준다 — 같은 카탈로그로 만들어 흉내 낸다.
  const t = errorsAuth(messages, locale)

  it('아이디 중복은 자동 아이디 재시도 대상이고, 아이디 단계로 돌아갈 거절이다', () => {
    expect(classifySignupError(t('usernameTaken'), t)).toEqual({
      usernameTaken: true,
      usernameStep: true,
    })
  })

  it('형식·누락은 재시도하지 않고 아이디 단계로 돌아간다', () => {
    for (const key of ['usernameInvalid', 'usernameRequired'])
      expect(classifySignupError(t(key), t)).toEqual({ usernameTaken: false, usernameStep: true })
  })

  it('다른 거절과 서버가 문장을 못 준 경우는 그 자리에 머문다', () => {
    for (const message of [t('emailTaken'), t('passwordTooShort'), ''])
      expect(classifySignupError(message, t)).toEqual({ usernameTaken: false, usernameStep: false })
  })
})

it('다른 로케일의 문장과는 맞지 않는다 — 화면과 같은 로케일의 카탈로그로 비교해야 한다', () => {
  const tKo = errorsAuth(ko, 'ko')
  const tEn = errorsAuth(en, 'en')
  expect(classifySignupError(tEn('usernameTaken'), tKo).usernameTaken).toBe(false)
})
