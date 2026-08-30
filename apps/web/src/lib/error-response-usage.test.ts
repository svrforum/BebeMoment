import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const API_DIR = path.join(process.cwd(), 'app/api')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (name === 'route.ts') out.push(full)
  }
  return out
}

/**
 * API 에러는 errorJson/errorJsonKey 를 지나야 서버 로그에 남는다. 직접
 * NextResponse.json({error}) 을 쓰면 그 경로만 조용히 로그에서 사라지고, 정작 문제를
 * 쫓을 때 아무 흔적이 없다 — 22개 라우트가 실제로 그 상태였다.
 */
describe('API 라우트는 에러를 헬퍼로 반환한다', () => {
  it('직접 NextResponse.json({ error ... }) 로 에러를 내지 않는다', () => {
    const offenders: string[] = []
    for (const file of routeFiles(API_DIR)) {
      const src = readFileSync(file, 'utf8')
      if (/NextResponse\.json\(\s*\{\s*error\s*[:,]/.test(src)) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }
    expect(offenders).toEqual([])
  })
})
