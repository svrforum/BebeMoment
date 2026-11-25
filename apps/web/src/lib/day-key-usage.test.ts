import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['app', 'src', 'scripts'].map((d) => path.join(process.cwd(), d))

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

// "지금" 을 UTC 로 잘라 날짜를 만드는 형태. 저장된 벽시계-as-UTC 값(`takenAt` 등)을 자르는
// `x.toISOString().slice(0, 10)` 은 맞는 코드라 막지 않는다 — 대상은 `new Date()` 를 바로 자르는 것.
const UTC_TODAY_PATTERNS = [
  /new Date\(\)\s*\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/,
  /new Date\(\)\s*\.toISOString\(\)\s*\.split\(\s*['"]T['"]\s*\)/,
]

/**
 * `new Date().toISOString().slice(0, 10)` 은 UTC 날짜라 KST 00:00~09:00 엔 어제가 나온다.
 * 성장·마일스톤 폼이 이걸 날짜 입력의 max·기본값으로 써서 새벽엔 오늘을 고를 수 없었다.
 * CI 는 UTC 로 돌아 테스트로는 드러나지 않으니 형태 자체를 막는다 — 오늘은 `localDayKey()`,
 * UTC 로 저장된 값을 날짜로 읽을 땐 `utcDayKey()`.
 */
describe('오늘 날짜는 localDayKey 로 만든다', () => {
  it('app·src·scripts 어디서도 new Date() 를 UTC 로 잘라 오늘을 만들지 않는다', () => {
    const offenders: string[] = []
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const src = readFileSync(file, 'utf8')
      if (UTC_TODAY_PATTERNS.some((re) => re.test(src))) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }
    expect(offenders).toEqual([])
  })
})
