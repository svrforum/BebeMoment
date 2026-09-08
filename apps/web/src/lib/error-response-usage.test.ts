import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['app/api', 'src/lib', 'src/server'].map((d) => path.join(process.cwd(), d))
// 헬퍼 자신만 NextResponse.json({error}) 을 만들 수 있다.
const ALLOWLIST = new Set(['src/lib/error-response.ts'])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

const RAW_ERROR_PATTERNS = [
  /NextResponse\.json\(\s*\{\s*error\s*[:,]/,
  // `new Response(JSON.stringify({ error …` — 헬퍼를 우회하는 또 다른 형태(429 가 그랬다).
  /new Response\(\s*JSON\.stringify\(\s*\{\s*error\s*[:,]/,
]

/**
 * API 에러는 errorJson/errorJsonKey/errorJsonText 를 지나야 서버 로그에 남고 요청 locale 로
 * 번역된다. 직접 NextResponse.json({error}) 을 쓰면 그 경로만 조용히 로그에서 사라지고, 정작
 * 문제를 쫓을 때 아무 흔적이 없다 — 22개 라우트가 실제로 그 상태였고, 라우트를 고친 뒤에도
 * requireAdmin(관리자 라우트 20개의 401/403)과 rate-limit 의 429 가 src/lib·src/server 에서
 * 같은 우회를 하고 있었다. 그래서 라우트 파일만이 아니라 서버 소스 전체를 본다.
 */
describe('API 에러는 헬퍼로 반환한다', () => {
  it('app/api·src/lib·src/server 어디서도 직접 에러 JSON 을 만들지 않는다', () => {
    const offenders: string[] = []
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const rel = path.relative(process.cwd(), file)
      if (ALLOWLIST.has(rel)) continue
      const src = readFileSync(file, 'utf8')
      if (RAW_ERROR_PATTERNS.some((re) => re.test(src))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
