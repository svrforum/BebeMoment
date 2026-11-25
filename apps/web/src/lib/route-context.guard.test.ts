import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { parseSource, parseText, sourceFiles, walkNodes } from '../test-support/source-files'

/**
 * 가족 구성원용 API 라우트는 requireRouteContext(@/lib/route-context) 하나로 세션과 현재 가족을
 * 확인한다. getAuth + resolveContext 를 손으로 이어 붙이면 미로그인·가족 없음 거절이 라우트마다
 * 달라지고(상태 코드·문구·로그), 정지된 멤버십 같은 조건을 한 곳에서 고쳐도 그 라우트만 빠진다.
 *
 * 값: 직접 써야 하는 한 줄 사유. 관리자 라우트는 requireAdmin 이 가족을 주지 않아 현재 가족을
 * 따로 찾는다.
 */
const ALLOWLIST: Record<string, string> = {
  'app/api/stream/family/route.ts': 'SSE — 거절도 JSON 이 아닌 평문 응답으로 낸다',
  'app/api/admin/assets/unrecoverable/route.ts': 'requireAdmin 뒤에 현재 가족을 찾는다',
  'app/api/admin/share/route.ts': 'requireAdmin 뒤에 현재 가족을 찾는다',
  'app/api/admin/members/[membershipId]/remove/route.ts': 'requireAdmin 뒤에 현재 가족을 찾는다',
  'app/api/admin/members/[membershipId]/reset-password/route.ts':
    'requireAdmin 뒤에 현재 가족을 찾는다',
  'app/api/admin/members/[membershipId]/role/route.ts': 'requireAdmin 뒤에 현재 가족을 찾는다',
  'app/api/admin/members/[membershipId]/suspend/route.ts': 'requireAdmin 뒤에 현재 가족을 찾는다',
  'app/api/admin/members/[membershipId]/unsuspend/route.ts': 'requireAdmin 뒤에 현재 가족을 찾는다',
}

const ROUTE_FILE = /\/route\.tsx?$/

/** 이 소스가 getAuth() 와 resolveContext() 를 둘 다 부르는지(주석·문자열 속 이름은 치지 않는다). */
function assemblesContext(sf: ts.SourceFile): boolean {
  const called = new Set<string>()
  walkNodes(sf, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression))
      called.add(node.expression.text)
  })
  return called.has('getAuth') && called.has('resolveContext')
}

function apiRoutes(): string[] {
  return sourceFiles('app/api').filter((rel) => ROUTE_FILE.test(rel))
}

describe('가족 구성원용 API 라우트는 requireRouteContext 로 컨텍스트를 얻는다', () => {
  it('탐지기: 두 함수를 다 부를 때만 잡고, 주석·한쪽만 부르는 것은 둔다', () => {
    const both = parseText(
      'a.ts',
      `const { session } = await getAuth()
const ctx = await resolveContext({ userId: session.userId, currentFamilyId: null }, prisma)`,
    )
    const ready = parseText('b.ts', 'const ctx = await requireRouteContext()')
    const authOnly = parseText(
      'c.ts',
      `// resolveContext() 대신 세션만 본다
const { session } = await getAuth()
const name = 'resolveContext()'`,
    )
    expect([both, ready, authOnly].map(assemblesContext)).toEqual([true, false, false])
  })

  it('app/api 의 라우트를 실제로 훑었다', () => {
    const routes = apiRoutes()
    expect(routes.length).toBeGreaterThan(50)
    expect(routes).toContain('app/api/albums/route.ts')
  })

  it('getAuth + resolveContext 를 직접 잇는 라우트는 사유와 함께 허용 목록에만 있다', () => {
    const offenders = apiRoutes().filter(
      (rel) => !(rel in ALLOWLIST) && assemblesContext(parseSource(rel)),
    )
    expect(
      offenders,
      'requireRouteContext() 를 쓸 것 — 정말 직접 이어야 하면 ALLOWLIST 에 한 줄 사유와 함께',
    ).toEqual([])
  })

  it('허용 목록에 낡은 항목이 없다', () => {
    const routes = new Set(apiRoutes())
    const stale = Object.keys(ALLOWLIST).flatMap((rel) => {
      if (!routes.has(rel)) return [`${rel} — 라우트가 없다`]
      if (!assemblesContext(parseSource(rel))) return [`${rel} — 더는 직접 잇지 않는다`]
      return []
    })
    expect(stale, '허용 목록에서 빼 주세요').toEqual([])
  })
})
