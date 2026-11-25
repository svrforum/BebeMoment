import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import ko from '../../messages/ko.json'
import { readSource, sourceFiles } from '../test-support/source-files'
import { errorKeyFromIssue } from './error-key'

describe('errorKeyFromIssue', () => {
  it('전체 경로에서 errors. 접두사를 뗀다', () => {
    expect(errorKeyFromIssue('errors.auth.passwordTooShort')).toBe('auth.passwordTooShort')
  })
  it('이미 상대 키면 그대로 둔다', () => {
    expect(errorKeyFromIssue('auth.passwordTooShort')).toBe('auth.passwordTooShort')
  })
  it('키 모양이 아니면 일반 검증 실패로', () => {
    expect(errorKeyFromIssue('Required')).toBe('invalidInput')
    expect(errorKeyFromIssue('String must contain at least 8 character(s)')).toBe('invalidInput')
    expect(errorKeyFromIssue(undefined)).toBe('invalidInput')
    expect(errorKeyFromIssue('')).toBe('invalidInput')
  })
})

const ERROR_KEY = /'errors\.([A-Za-z][\w-]*(?:\.[\w-]+)+)'/g

function lookup(catalog: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part]
    return undefined
  }, catalog)
}

/**
 * zod 메시지에 박은 `errors.…` 키는 타입이 안 잡힌다 — 오타가 나면 사용자가 문장 대신
 * 키를 그대로 본다(`t.has` 가 false 면 키가 응답에 실린다). 두 로케일 모두에서 실재하는지
 * 본다.
 */
describe('서버가 쓰는 errors.* 키는 카탈로그에 있다', () => {
  it('ko·en 양쪽에서 모두 문자열로 풀린다', () => {
    const missing: string[] = []
    for (const file of sourceFiles('app/api', 'src/server')) {
      for (const m of readSource(file).matchAll(ERROR_KEY)) {
        const key = `errors.${m[1]}`
        for (const [locale, catalog] of [
          ['ko', ko],
          ['en', en],
        ] as const) {
          if (typeof lookup(catalog as Record<string, unknown>, key) !== 'string')
            missing.push(`${locale}: ${key} (${file})`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
