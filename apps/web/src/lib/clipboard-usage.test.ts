import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = ['app', 'src'].map((d) => path.join(process.cwd(), d))
const ALLOWLIST = new Set(['src/lib/clipboard.ts'])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

/**
 * `navigator.clipboard` 는 보안 컨텍스트(https·localhost)에서만 있다. 이 앱은 LAN http 로도
 * 쓰이고 안드로이드 앱 WebView 도 http 라, 직접 부르면 거기서는 복사가 안 되거나(undefined)
 * 처리되지 않은 rejection 으로 아무 표시 없이 끝난다. 복사는 execCommand 폴백까지 하는
 * `copyText()` 를 거치고, false 면 호출자가 사용자에게 알린다.
 */
describe('클립보드 복사는 copyText 로', () => {
  it('app·src 어디서도 navigator.clipboard 를 직접 부르지 않는다', () => {
    const offenders: string[] = []
    for (const file of ROOTS.flatMap(sourceFiles)) {
      const rel = path.relative(process.cwd(), file)
      if (ALLOWLIST.has(rel)) continue
      const src = readFileSync(file, 'utf8')
      if (/navigator\.clipboard\b/.test(src.replace(/^\s*(\/\/|\*).*$/gm, ''))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
