import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  hasDirective,
  lineOf,
  parseSource,
  parseText,
  sourceFiles,
  walkNodes,
} from '../test-support/source-files'

const ABSOLUTE = /^([a-z][a-z\d+.-]*:)?\/\//i
const NETWORK_CTORS = new Set(['EventSource', 'WebSocket'])
const HTTP_METHOD = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/i

/** 같은 파일의 `const X = '…'` 를 따라가 URL 의 앞부분을 얻는다. 알 수 없으면 null. */
function urlPrefix(
  expr: ts.Expression | undefined,
  consts: Map<string, ts.Expression>,
): string | null {
  if (!expr) return null
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isTemplateExpression(expr)) return expr.head.text
  if (ts.isParenthesizedExpression(expr)) return urlPrefix(expr.expression, consts)
  if (
    ts.isNewExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'URL'
  )
    return urlPrefix(expr.arguments?.[0], consts)
  if (ts.isIdentifier(expr)) {
    const init = consts.get(expr.text)
    return init ? urlPrefix(init, new Map()) : null
  }
  return null
}

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return null
}

/** 브라우저 connect-src 가 막는 요청(fetch·EventSource·WebSocket·XHR·sendBeacon)의 URL 인자. */
function requestUrl(node: ts.Node): ts.Expression | undefined {
  if (ts.isCallExpression(node)) {
    const name = calleeName(node.expression)
    if (name === 'fetch' || name === 'sendBeacon') return node.arguments[0]
    if (name === 'open' && node.arguments.length >= 2) {
      const method = node.arguments[0]
      if (method && ts.isStringLiteralLike(method) && HTTP_METHOD.test(method.text))
        return node.arguments[1]
    }
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    if (NETWORK_CTORS.has(node.expression.text)) return node.arguments?.[0]
  }
  return undefined
}

const SERVER_ONLY_MODULES = new Set(['server-only', 'next/headers'])
const SERVER_ONLY_FILE = /(^|\/)(route|actions)\.tsx?$/

/**
 * 브라우저 번들에 들어갈 수 있는 모듈인지. 'use client' 만 보면 지시문 없는 헬퍼
 * (src/lib/app-release.ts 처럼 클라이언트 컴포넌트가 import 하는 것)를 놓친다 — 그래서 서버에서만
 * 도는 곳을 빼고 전부 본다. 서버 컴포넌트도 남는데, 외부 호출은 src/server 나 라우트에 둔다.
 */
function browserReachable(rel: string, sf: ts.SourceFile): boolean {
  if (/^(src\/server|src\/test-support|app\/api)\//.test(rel) || SERVER_ONLY_FILE.test(rel))
    return false
  if (hasDirective(sf, 'use server')) return false
  return !sf.statements.some(
    (stmt) =>
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      SERVER_ONLY_MODULES.has(stmt.moduleSpecifier.text),
  )
}

function externalRequests(rel: string, sf: ts.SourceFile): number[] {
  if (!browserReachable(rel, sf)) return []
  const consts = new Map<string, ts.Expression>()
  walkNodes(sf, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isVariableDeclarationList(node.parent) &&
      node.parent.flags & ts.NodeFlags.Const
    )
      consts.set(node.name.text, node.initializer)
  })
  const lines: number[] = []
  walkNodes(sf, (node) => {
    const prefix = urlPrefix(requestUrl(node), consts)
    if (prefix !== null && ABSOLUTE.test(prefix)) lines.push(lineOf(sf, node))
  })
  return lines
}

describe('클라이언트 코드는 외부 오리진을 직접 부르지 않는다', () => {
  it('탐지기가 절대 주소 요청을 알아본다', () => {
    const bad = parseText(
      'bad.tsx',
      `'use client'
const RELEASES = 'https://api.github.com/repos/x/y/releases'
export function f(xhr: XMLHttpRequest) {
  fetch(RELEASES)
  window.fetch(\`https://example.com/\${1}\`)
  new EventSource('//example.com/stream')
  new WebSocket('wss://example.com/ws')
  xhr.open('GET', 'http://example.com/a')
  navigator.sendBeacon(new URL('https://example.com/b'))
}`,
    )
    expect(externalRequests('src/components/bad.tsx', bad)).toEqual([4, 5, 6, 7, 8, 9])
  })

  it('같은 오리진 주소와 서버 모듈은 건드리지 않는다', () => {
    const ok = parseText(
      'ok.tsx',
      `'use client'
export function f(url: string) {
  fetch('/api/app/latest-release')
  fetch(\`/api/story/\${1}\`)
  fetch(url)
  new EventSource('/api/stream/family')
  window.open('https://example.com', '_blank')
}`,
    )
    expect(externalRequests('src/components/ok.tsx', ok)).toEqual([])
  })

  it("지시문 없는 헬퍼도 본다 — 'use client' 컴포넌트가 import 하면 브라우저에서 돈다", () => {
    const helper = parseText(
      'app-release.ts',
      `const RELEASES = 'https://api.github.com/repos/x/y/releases'
export async function fetchLatestRelease() {
  return (await fetch(RELEASES)).json()
}`,
    )
    expect(externalRequests('src/lib/app-release.ts', helper)).toEqual([3])
    expect(externalRequests('app/(app)/page.tsx', helper)).toEqual([3])
  })

  it('서버에서만 도는 모듈은 건드리지 않는다', () => {
    const call = `export const r = () => fetch('https://example.com')`
    for (const rel of [
      'src/server/app-release/latest.ts',
      'app/api/app/latest-release/route.ts',
      'app/(app)/admin/route.ts',
      'app/(app)/settings/actions.ts',
    ])
      expect(externalRequests(rel, parseText(rel, call))).toEqual([])
    for (const head of [
      `'use server'`,
      `import 'server-only'`,
      `import { headers } from 'next/headers'`,
    ])
      expect(externalRequests('src/lib/x.ts', parseText('x.ts', `${head}\n${call}`))).toEqual([])
  })

  /**
   * CSP 가 `connect-src 'self'` 라 브라우저의 외부 오리진 요청은 예외도 없이 조용히 막힌다.
   * 앱 업데이트 배너가 api.github.com 을 직접 불러 몇 달간 죽어 있었다. 서드파티 조회는
   * 우리 /api 라우트를 거친다(app/api/app/latest-release 가 그 예). 서버에서 curl 로
   * 시험해서는 절대 안 보이는 부류라 정적으로 막는다. 주소를 변수로 넘기는 경우는 못 본다.
   */
  it('브라우저에서 돌 수 있는 모듈 어디에도 절대 주소 요청이 없다', () => {
    const files = sourceFiles('src', 'app')
    const scanned = files.filter((rel) => browserReachable(rel, parseSource(rel)))
    expect(scanned).toEqual(
      expect.arrayContaining([
        'src/lib/app-release.ts',
        'src/lib/push-client.ts',
        'src/lib/widget-client.ts',
        'src/components/upload/report-failure.ts',
      ]),
    )
    const offenders: string[] = []
    for (const rel of files) {
      const sf = parseSource(rel)
      for (const line of externalRequests(rel, sf)) offenders.push(`${rel}:${line}`)
    }
    expect(offenders).toEqual([])
  })
})
