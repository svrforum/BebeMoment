import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import {
  lineOf,
  parseSource,
  parseText,
  sourceFiles,
  walkNodes,
} from '../test-support/source-files'

const DB_PACKAGE = /^@bebe\/db-(public|media)(\/|$)/
const RAW_CLIENT = new Set(['prisma', 'PrismaClient'])

/** tenant 확장을 끼우는 유일한 곳. test-support 는 확장 없는 테스트 DB 를 일부러 쓴다. */
const ALLOWED = (rel: string): boolean =>
  rel === 'src/lib/db-init.ts' || rel.startsWith('src/test-support/')

function rawClientUses(sf: ts.SourceFile): string[] {
  const found: string[] = []
  walkNodes(sf, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!DB_PACKAGE.test(node.moduleSpecifier.text)) return
      const clause = node.importClause
      if (!clause || clause.isTypeOnly) return
      const bindings = clause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) {
        found.push(`${lineOf(sf, node)} * as ${bindings.name.text}`)
        return
      }
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          const imported = (el.propertyName ?? el.name).text
          if (!el.isTypeOnly && RAW_CLIENT.has(imported))
            found.push(`${lineOf(sf, el)} ${imported}`)
        }
      }
      return
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      DB_PACKAGE.test(node.arguments[0].text)
    ) {
      found.push(`${lineOf(sf, node)} import()`)
      return
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'PrismaClient'
    )
      found.push(`${lineOf(sf, node)} new PrismaClient`)
  })
  return found
}

describe('raw Prisma 클라이언트는 db-init 밖으로 나오지 않는다', () => {
  it('탐지기가 우회 경로를 알아본다', () => {
    const sf = parseText(
      'x.ts',
      `import { prisma } from '@bebe/db-public'
import { PrismaClient as P, Prisma } from '@bebe/db-media'
import * as db from '@bebe/db-public'
import { type PrismaClient, AssetStatus } from '@bebe/db-media'
import type { prisma as typed } from '@bebe/db-public'
const lazy = () => import('@bebe/db-media')
const c = new PrismaClient()`,
    )
    expect(rawClientUses(sf)).toEqual([
      '1 prisma',
      '2 PrismaClient',
      '3 * as db',
      '6 import()',
      '7 new PrismaClient',
    ])
  })

  /**
   * `@bebe/db-public`·`@bebe/db-media` 의 `prisma` 는 tenant 확장이 없는 원본이다. 가족 격리는
   * 오직 그 확장이 하므로(DB 롤은 가족 경계가 아니다) 원본을 쓰면 familyId 가 빠진 쿼리가
   * 개발 중에도 막히지 않는다. 앱 코드는 `@/lib/db-init` 의 prismaPublic·prismaMedia 를 쓴다.
   * 타입(`import type { PrismaClient }`)과 enum·`Prisma` 네임스페이스 값은 괜찮다.
   */
  it('apps/web 어디서도 원본 클라이언트를 값으로 가져오지 않는다', () => {
    const offenders: string[] = []
    const files = sourceFiles('.')
    expect(files).toContain('proxy.ts')
    for (const rel of files) {
      if (ALLOWED(rel)) continue
      for (const use of rawClientUses(parseSource(rel))) offenders.push(`${rel}:${use}`)
    }
    expect(offenders).toEqual([])
  })
})
