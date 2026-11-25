import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { lineOf, parseSource, sourceFiles, walkNodes } from '../test-support/source-files'

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/

/**
 * 아직 카탈로그로 못 옮긴 곳. **여기 새 항목을 추가하지 말 것** — 새 사용자 문구는
 * `errors.<key>`(ServiceError·zod 메시지) 나 네임스페이스 키로 만든다.
 *
 * - `src/server/album/*`: 세 문구 모두 개수·깊이가 들어가는 동적 메시지라 ICU placeholder
 *   키가 필요하다(`errors.album.maxDepth` / `errors.album.hasChildren`).
 * - `src/server/backup/*`: 관리자 복구 콘솔과 컨테이너 stdout 으로 나가는 **운영자용
 *   진행 로그·진단 문자열**이다(psql stderr, 체인 id, 경로). 요청 로케일이 없는 CLI
 *   복구 경로에서도 같은 코드가 돌아 별도 설계가 필요하다.
 * - `app/global-error.tsx`: 루트 레이아웃이 깨졌을 때의 최후 화면이라 i18n 프로바이더가 없다 —
 *   로케일을 알 수 없어 한/영을 나란히 쓴다.
 * - `src/components/auth/sns-brand.tsx`: 관리자가 공급자 이름을 한글로 지어도('네이버')
 *   브랜드를 알아보려는 키워드와, 번역하지 않는 브랜드 이름(아이콘 라벨)이다.
 */
const ALLOWLIST = [
  'app/global-error.tsx',
  'src/components/auth/sns-brand.tsx',
  'src/server/album/create.ts',
  'src/server/album/delete.ts',
  'src/server/album/move.ts',
  'src/server/backup/chain.ts',
  'src/server/backup/remote.ts',
  'src/server/backup/restore.ts',
]

/**
 * 한글이 든 문자열·템플릿·JSX 본문의 줄 번호. 주석은 파서가 노드로 주지 않으므로 자연히 빠진다
 * (주석은 한/영 혼용 OK). 정규식 리터럴은 화면에 나가는 글이 아니라 뺀다.
 */
function hangulLiteralLines(rel: string): number[] {
  const sf = parseSource(rel)
  const lines: number[] = []
  walkNodes(sf, (node) => {
    let text: string | undefined
    if (ts.isJsxText(node)) text = node.text
    else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      text = node.text
    if (text !== undefined && HANGUL.test(text)) lines.push(lineOf(sf, node))
  })
  return lines
}

/**
 * 화면·응답에 나가는 문구는 카탈로그를 지나야 요청 로케일로 번역된다. 서버에서 zod 메시지에
 * 한국어를 박으면 `errorJsonText` 로 그대로 나가고, `throw new Error('한국어')` 는
 * `errors.badRequest` 의 raw message 로 새어 영어 UI 에서도 한국어가 보인다 — 실제로
 * 20개 파일 40군데가 그랬다. 클라이언트 컴포넌트도 같다: 푸시 테스트 버튼의 토스트 10줄과
 * 가입 화면의 서버 에러 판별이 한국어로 박혀 있어 영어 UI 에서 한국어가 뜨거나 판별이 빗나갔다.
 */
describe('소스에 사용자용 한국어 리터럴이 없다', () => {
  it('app·src 어디에도 (주석 밖) 한글 문자열이 없다', () => {
    const allow = new Set(ALLOWLIST)
    const offenders: string[] = []
    for (const rel of sourceFiles('app', 'src')) {
      if (allow.has(rel)) continue
      for (const line of hangulLiteralLines(rel)) offenders.push(`${rel}:${line}`)
    }
    expect(offenders).toEqual([])
  })

  it('허용 목록은 실제로 아직 한글이 있는 파일만 담는다', () => {
    const stale = ALLOWLIST.filter((rel) => hangulLiteralLines(rel).length === 0)
    expect(stale).toEqual([])
  })
})
