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
/** 서버 액션 거절 — 키는 늘 두 번째 인자(status, errorKey)다. */
const ACTION_REJECT_CALLS = new Set(['actionReject', 'actionFailure'])

type KeyUse = { key: string; where: string }

function literalTexts(expr: ts.Expression | undefined): string[] {
  if (!expr) return []
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text]
  if (ts.isParenthesizedExpression(expr)) return literalTexts(expr.expression)
  if (ts.isConditionalExpression(expr))
    return [...literalTexts(expr.whenTrue), ...literalTexts(expr.whenFalse)]
  return []
}

/** `service`: errors 네임스페이스 상대 키, `action`: 서버 액션 거절의 카탈로그 전체 경로. */
function collectKeys(): { service: KeyUse[]; action: KeyUse[] } {
  const service: KeyUse[] = []
  const action: KeyUse[] = []
  for (const rel of sourceFiles('src', 'app')) {
    const sf = parseSource(rel)
    walkNodes(sf, (node) => {
      let keys: string[]
      let into = service
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'ActionRejection') {
          keys = literalTexts(node.arguments?.[1])
          into = action
        } else {
          const index = MESSAGE_ARG[node.expression.text]
          if (index === undefined) return
          keys = literalTexts(node.arguments?.[index])
          // 평범한 Error 는 내부용 문장도 많다 — errorJson 이 번역을 시도하는 키 모양만 본다.
          if (node.expression.text === 'Error') keys = keys.filter((k) => CATALOG_KEY.test(k))
        }
      } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'errorJsonKey') keys = literalTexts(node.arguments[0])
        else if (ACTION_REJECT_CALLS.has(node.expression.text)) {
          keys = literalTexts(node.arguments[1])
          into = action
        } else return
      } else {
        return
      }
      for (const key of keys) into.push({ key, where: `${rel}:${lineOf(sf, node)}` })
    })
  }
  return { service, action }
}

const KEYS = collectKeys()

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
  const uses = KEYS.service

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

/**
 * 서버 액션의 거절(`actionReject(status, key)`·`actionFailure`·`new ActionRejection`)은 반대로
 * 카탈로그 **전체** 경로다 — 클라이언트의 actionErrorMessage 가 루트 번역기의 `t.has(key)` 로
 * 찾고, 없으면 "문제가 생겼어요" 로 뭉개진다. 오타 하나로 거절 사유가 통째로 사라진다.
 */
describe('서버 액션 거절 키', () => {
  const uses = KEYS.action

  it('리터럴 키를 실제로 모은다', () => {
    const keys = uses.map((u) => u.key)
    expect(keys).toContain('errors.unauthorized')
    expect(keys).toContain('admin.notifications.errAdminRequired')
  })

  it('키가 ko·en 카탈로그 양쪽에서 문자열로 풀린다', () => {
    const missing: string[] = []
    for (const { key, where } of uses) {
      for (const [locale, catalog] of [
        ['ko', ko],
        ['en', en],
      ] as const) {
        if (typeof lookup(catalog as Record<string, unknown>, key) !== 'string')
          missing.push(`${locale}: ${key} (${where})`)
      }
    }
    expect(missing).toEqual([])
  })
})
