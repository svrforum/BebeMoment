import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SERVER_DIR = path.join(process.cwd(), 'src/server')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

/**
 * 스토리 사진은 사용자가 정한 순서(order)가 전부다 — 1번이 대표(썸네일)다. 그런데
 * `include: { assets: true }` 는 정렬이 없어 Postgres 가 주는 순서로 나온다. 타임라인·
 * 스토리 목록·추억·앨범·북마크가 그 상태였고, 사진이 역순으로 보이고 대표까지 뒤바뀌었다
 * (상세 화면만 정렬돼 있어서 화면마다 다른 순서가 보였다).
 *
 * ⚠️ MilestoneAsset 은 order 컬럼이 없다(마일스톤 사진은 순서 개념이 없음) — 예외.
 */
describe('스토리 사진 include 는 항상 order 로 정렬한다', () => {
  it('정렬 없는 include: { assets: true } 가 없다', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SERVER_DIR)) {
      if (file.includes(`${path.sep}milestone${path.sep}`)) continue
      const src = readFileSync(file, 'utf8')
      if (/include:\s*\{\s*assets:\s*true/.test(src)) {
        offenders.push(path.relative(process.cwd(), file))
      }
    }
    expect(offenders).toEqual([])
  })
})
