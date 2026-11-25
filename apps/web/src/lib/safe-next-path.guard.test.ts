import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  lineOf,
  parseSource,
  parseText,
  sourceFiles,
  walkNodes,
} from '../test-support/source-files'

// 앞 두 글자만 보는 검사(`/^\/(?![/\\])/`)는 리다이렉트 대상을 거르기에 모자란다 — 브라우저가
// URL 을 풀 때 탭·줄바꿈을 지워서 '/\t/evil.example' 이 //evil.example 로 바뀐다. 그 정규식을
// 복사해 쓰는 곳이 생기면 safe-next-path.ts 가 막는 우회가 그 경로로만 다시 열린다.
const PREFIX_ONLY = '^\\/(?![/\\\\])'
const HOME = 'src/lib/safe-next-path.ts'

function prefixOnlyChecks(sf: ts.SourceFile): number[] {
  const lines: number[] = []
  walkNodes(sf, (node) => {
    if (
      node.kind === ts.SyntaxKind.RegularExpressionLiteral &&
      node.getText(sf).includes(PREFIX_ONLY)
    )
      lines.push(lineOf(sf, node))
  })
  return lines
}

describe('로그인 뒤 돌아갈 경로는 safeNextPath 하나로 거른다', () => {
  it('탐지기가 앞 글자만 보는 정규식을 알아본다', () => {
    const sf = parseText(
      'x.ts',
      `const ok = /^\\/(?![/\\\\])/.test(p)
const other = /^\\/api\\//.test(p)`,
    )
    expect(prefixOnlyChecks(sf)).toEqual([1])
  })

  it('apps/web 어디에도 그 정규식의 복사본이 없다', () => {
    const offenders: string[] = []
    const files = sourceFiles('.')
    expect(files).toContain(HOME)
    for (const rel of files) {
      if (rel === HOME) continue
      for (const line of prefixOnlyChecks(parseSource(rel))) offenders.push(`${rel}:${line}`)
    }
    expect(offenders, 'safeNextPath(@/lib/safe-next-path) 를 쓸 것').toEqual([])
  })
})
