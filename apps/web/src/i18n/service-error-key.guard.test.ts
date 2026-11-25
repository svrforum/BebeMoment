import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import ko from '../../messages/ko.json'
import { lineOf, parseSource, sourceFiles, walkNodes } from '../test-support/source-files'

/** 메시지 인자의 위치 — ServiceError 만 (status, message) 다. */
const MESSAGE_ARG: Record<string, number> = {
  ServiceError: 1,
  NotFoundError: 0,
  ForbiddenError: 0,
  ConflictError: 0,
  Error: 0,
}
const CATALOG_KEY = /^[a-z][\w-]*(?:\.[\w-]+)+$/i

type KeyUse = { key: string; where: string }

function literalTexts(expr: ts.Expression | undefined): string[] {
  if (!expr) return []
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text]
  if (ts.isParenthesizedExpression(expr)) return literalTexts(expr.expression)
  if (ts.isConditionalExpression(expr))
    return [...literalTexts(expr.whenTrue), ...literalTexts(expr.whenFalse)]
  return []
}

function collectKeys(): KeyUse[] {
  const uses: KeyUse[] = []
  for (const rel of sourceFiles('src', 'app')) {
    const sf = parseSource(rel)
    walkNodes(sf, (node) => {
      let keys: string[]
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const index = MESSAGE_ARG[node.expression.text]
        if (index === undefined) return
        keys = literalTexts(node.arguments?.[index])
        // 평범한 Error 는 내부용 문장도 많다 — errorJson 이 번역을 시도하는 키 모양만 본다.
        if (node.expression.text === 'Error') keys = keys.filter((k) => CATALOG_KEY.test(k))
      } else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'errorJsonKey'
      ) {
        keys = literalTexts(node.arguments[0])
      } else {
        return
      }
      for (const key of keys) uses.push({ key, where: `${rel}:${lineOf(sf, node)}` })
    })
  }
  return uses
}

function lookup(catalog: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part]
    return undefined
  }, catalog)
}

/**
 * 서비스 에러는 `errors` 네임스페이스의 **상대** 키로 던진다(`new NotFoundError('album.notFound')`).
 * errorJson·errorJsonKey 는 `getTranslations('errors')` 로 묶여 있고 서버 액션 래퍼는 앞에
 * `errors.` 를 붙이므로, 여기에 `errors.` 를 또 붙이거나 카탈로그에 없는 키를 던지면 `t.has` 가
 * false 가 되어 사용자가 문장 대신 키 문자열을 그대로 본다. 타입체크도 다른 가드도 못 잡는다.
 * 전체 경로(`errors.<ns>.<key>`)는 zod 메시지에만 쓴다(error-key.test.ts 가 본다).
 */
describe('서비스 에러 키', () => {
  const uses = collectKeys()

  it('리터럴 키를 실제로 모은다', () => {
    expect(uses.length).toBeGreaterThan(50)
  })

  it('errors. 접두사 없이 상대 키로 던진다', () => {
    const prefixed = uses.filter((u) => u.key.startsWith('errors.')).map((u) => u.where)
    expect(prefixed).toEqual([])
  })

  it('errors.<key> 가 ko·en 카탈로그 양쪽에서 문자열로 풀린다', () => {
    const missing: string[] = []
    for (const { key, where } of uses) {
      if (key.startsWith('errors.')) continue
      for (const [locale, catalog] of [
        ['ko', ko],
        ['en', en],
      ] as const) {
        if (typeof lookup(catalog as Record<string, unknown>, `errors.${key}`) !== 'string')
          missing.push(`${locale}: errors.${key} (${where})`)
      }
    }
    expect(missing).toEqual([])
  })
})
