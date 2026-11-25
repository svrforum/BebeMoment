import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/** apps/web 의 절대 경로 — 가드는 어느 cwd 에서 돌든 같은 파일을 본다. */
export const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const SKIP_DIRS = new Set(['node_modules', '.next', 'generated'])
const SOURCE = /\.tsx?$/
const TEST = /\.test\.tsx?$/

/**
 * `dirs`(apps/web 기준, '.' 이면 전체) 아래의 .ts/.tsx 소스. 테스트 파일은 뺀다.
 * 돌려주는 경로도 apps/web 기준이고 구분자는 늘 '/' 라 허용 목록과 그대로 비교된다.
 */
export function sourceFiles(...dirs: string[]): string[] {
  const out: string[] = []
  const walk = (rel: string): void => {
    for (const entry of readdirSync(path.join(WEB_ROOT, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(child)
      } else if (SOURCE.test(entry.name) && !TEST.test(entry.name)) {
        out.push(child)
      }
    }
  }
  for (const dir of dirs) walk(dir === '.' ? '' : dir.replace(/\/+$/, ''))
  return out.sort()
}

export function readSource(rel: string): string {
  return readFileSync(path.join(WEB_ROOT, rel), 'utf8')
}

/**
 * 정규식 대신 TypeScript 파서로 읽는다 — JSX 본문·템플릿·주석 안의 따옴표나 `//` 때문에
 * 손으로 짠 스캐너가 문자열 경계를 놓치는 일이 없다.
 */
export function parseSource(rel: string): ts.SourceFile {
  return parseText(rel, readSource(rel))
}

/** 가드 자신의 테스트용 — 가짜 소스 문자열을 같은 방식으로 파싱한다. */
export function parseText(name: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

export function walkNodes(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walkNodes(child, visit))
}

export function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

/** 파일 맨 앞의 지시문 중에 `'use client'` 가 있는지. */
export function isClientModule(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false
    if (stmt.expression.text === 'use client') return true
  }
  return false
}
