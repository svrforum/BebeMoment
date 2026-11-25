import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  lineOf,
  parseSource,
  parseText,
  sourceFiles,
  walkNodes,
} from '../test-support/source-files'

/** `new Date()`·`new Date(Date.now())` — 지금 이 순간. */
function isNow(expr: ts.Expression | undefined): boolean {
  if (!expr) return false
  if (ts.isParenthesizedExpression(expr)) return isNow(expr.expression)
  if (!ts.isNewExpression(expr) || !ts.isIdentifier(expr.expression)) return false
  if (expr.expression.text !== 'Date') return false
  const args = expr.arguments ?? []
  if (args.length === 0) return true
  const [arg] = args
  return (
    args.length === 1 &&
    arg !== undefined &&
    ts.isCallExpression(arg) &&
    arg.arguments.length === 0 &&
    arg.expression.getText() === 'Date.now'
  )
}

/** `x.toISOString().slice(0, 10)`·`.substring(0, 10)`·`.split('T')` 의 x. 아니면 null. */
function utcDayCutSubject(node: ts.Node): ts.Expression | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null
  const iso = node.expression.expression
  if (!ts.isCallExpression(iso) || !ts.isPropertyAccessExpression(iso.expression)) return null
  if (iso.expression.name.text !== 'toISOString') return null
  const method = node.expression.name.text
  const args = node.arguments.map((a) =>
    ts.isNumericLiteral(a) || ts.isStringLiteralLike(a) ? a.text : null,
  )
  const cutsDay =
    ((method === 'slice' || method === 'substring') && args[0] === '0' && args[1] === '10') ||
    (method === 'split' && args[0] === 'T')
  return cutsDay ? iso.expression.expression : null
}

/** 한 스코프(함수·파일)에서 `name` 에 들어가는 값들 — 선언·매개변수 기본값·대입. 안쪽 함수는 제외. */
function valuesIn(scope: ts.Node, name: string): (ts.Expression | undefined)[] {
  const values: (ts.Expression | undefined)[] = []
  const visit = (n: ts.Node): void => {
    if (n !== scope && ts.isFunctionLike(n)) return
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && ts.isIdentifier(n.name)) {
      if (n.name.text === name) values.push(n.initializer)
    } else if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(n.left) &&
      n.left.text === name
    )
      values.push(n.right)
    ts.forEachChild(n, visit)
  }
  visit(scope)
  return values
}

/** 이 식별자를 선언한 가장 가까운 함수(없으면 파일)에서 `new Date()` 가 들어가는지. */
function holdsNow(id: ts.Identifier): boolean {
  for (let scope: ts.Node | undefined = id.parent; scope; scope = scope.parent) {
    if (!ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) continue
    const values = valuesIn(scope, id.text)
    if (values.length > 0) return values.some(isNow)
  }
  return false
}

function utcTodayLines(sf: ts.SourceFile): number[] {
  const lines: number[] = []
  walkNodes(sf, (node) => {
    const subject = utcDayCutSubject(node)
    if (subject && (isNow(subject) || (ts.isIdentifier(subject) && holdsNow(subject))))
      lines.push(lineOf(sf, node))
  })
  return lines
}

/**
 * `new Date().toISOString().slice(0, 10)` 은 UTC 날짜라 KST 00:00~09:00 엔 어제가 나온다.
 * 성장·마일스톤 폼이 이걸 날짜 입력의 max·기본값으로 써서 새벽엔 오늘을 고를 수 없었다.
 * CI 는 UTC 로 돌아 테스트로는 드러나지 않으니 형태 자체를 막는다 — 오늘은 `localDayKey()`,
 * UTC 로 저장된 값을 날짜로 읽을 땐 `utcDayKey()`. 저장된 벽시계-as-UTC 값(`takenAt` 등)을
 * 자르는 `x.toISOString().slice(0, 10)` 은 맞는 코드라 막지 않는다 — 대상은 "지금" 을 자르는 것.
 */
describe('오늘 날짜는 localDayKey 로 만든다', () => {
  it('탐지기: 지금을 바로 자르거나, 지금을 담은 변수를 자르는 것', () => {
    const sf = parseText(
      'x.ts',
      `const a = new Date().toISOString().slice(0, 10)
const b = new Date(Date.now()).toISOString().split('T')[0]
function f() {
  const now = new Date()
  return now.toISOString().slice(0, 10)
}
function g(items: string[]) {
  const now = new Date(Date.now())
  return items.map(() => now.toISOString().substring(0, 10))
}
function h(at = new Date()) {
  return at.toISOString().slice(0, 10)
}`,
    )
    expect(utcTodayLines(sf)).toEqual([1, 2, 5, 9, 12])
  })

  it('탐지기: 저장된 값이나 넘겨받은 시각을 자르는 것은 그대로 둔다', () => {
    const sf = parseText(
      'y.ts',
      `function f(row: { takenAt: Date }, now: Date) {
  const at = new Date(row.takenAt)
  return [
    row.takenAt.toISOString().slice(0, 10),
    at.toISOString().slice(0, 10),
    now.toISOString().slice(0, 10),
    new Date(Date.now() - 1).toISOString().slice(0, 10),
    new Date().toISOString().slice(0, 16),
  ]
}
function g() {
  const now = new Date()
  return now
}`,
    )
    expect(utcTodayLines(sf)).toEqual([])
  })

  it('app·src·scripts 어디서도 지금을 UTC 로 잘라 오늘을 만들지 않는다', () => {
    const offenders: string[] = []
    for (const rel of sourceFiles('app', 'src', 'scripts')) {
      const sf = parseSource(rel)
      for (const line of utcTodayLines(sf)) offenders.push(`${rel}:${line}`)
    }
    expect(offenders).toEqual([])
  })
})
