import { describe, expect, it } from 'vitest'
import { matchBrand } from './sns-brand-keywords'

describe('matchBrand', () => {
  it('영문 이름은 대소문자와 상관없이 알아본다', () => {
    expect(matchBrand('NAVER')).toBe('naver')
    expect(matchBrand('Kakao Login')).toBe('kakao')
    expect(matchBrand('Google Workspace')).toBe('google')
  })

  it('관리자가 한글로 지은 이름도 알아본다', () => {
    expect(matchBrand('네이버 로그인')).toBe('naver')
    expect(matchBrand('카카오')).toBe('kakao')
    expect(matchBrand('구글')).toBe('google')
  })

  it('모르는 공급자는 null', () => {
    expect(matchBrand('Keycloak')).toBeNull()
    expect(matchBrand('')).toBeNull()
  })
})
