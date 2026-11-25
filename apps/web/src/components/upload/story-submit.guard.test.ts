import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { parseSource, parseText, walkNodes } from '../../test-support/source-files'

/**
 * 스토리를 올리는 세 화면은 업로드 → 자산 id 모으기 → 저장 → 실패 시 되돌리기·진단 보고를
 * story-submit.ts 한 벌로 돈다(useStorySubmit). 화면이 그 조각을 직접 가져다 쓰면 복사본이 다시
 * 생겨, 순서를 고친 수정이 그 화면만 비껴간다 — 업로드 시트가 실제로 세 번째 복사본을 들고 있었다.
 */
const FLOWS: Record<string, string> = {
  'src/components/upload/upload-dashboard.tsx': 'upload-sheet',
  'src/components/timeline/timeline-composer.tsx': 'timeline-composer',
  'src/components/story/StoryEditForm.tsx': 'story-edit',
}

const SUBMIT_PIECES = [
  'collect-asset-ids',
  'created-asset-ids',
  'rollback-assets',
  'report-failure',
]

function storySubmitFlows(sf: ts.SourceFile): string[] {
  const flows: string[] = []
  walkNodes(sf, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useStorySubmit'
    ) {
      const [arg] = node.arguments
      flows.push(arg && ts.isStringLiteralLike(arg) ? arg.text : '<non-literal>')
    }
  })
  return flows
}

function submitPieceImports(sf: ts.SourceFile): string[] {
  return sf.statements.flatMap((stmt) => {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) return []
    const spec = stmt.moduleSpecifier.text
    return SUBMIT_PIECES.some((piece) => spec === `./${piece}` || spec.endsWith(`/${piece}`))
      ? [spec]
      : []
  })
}

describe('스토리 제출은 useStorySubmit 한 벌만 쓴다', () => {
  it('탐지기: 흐름 인자와 조각 import 를 읽는다', () => {
    const sf = parseText(
      'x.tsx',
      `import { rollbackAssets } from './rollback-assets'
import { reportUploadFailure } from '@/components/upload/report-failure'
import { useStorySubmit } from './use-story-submit'
const a = useStorySubmit('upload-sheet')`,
    )
    expect(storySubmitFlows(sf)).toEqual(['upload-sheet'])
    expect(submitPieceImports(sf)).toEqual([
      './rollback-assets',
      '@/components/upload/report-failure',
    ])
  })

  it.each(Object.entries(FLOWS))('%s 는 useStorySubmit(%j) 로만 제출한다', (rel, flow) => {
    const sf = parseSource(rel)
    expect(storySubmitFlows(sf)).toEqual([flow])
    expect(submitPieceImports(sf), 'story-submit.ts 를 거칠 것').toEqual([])
  })
})
