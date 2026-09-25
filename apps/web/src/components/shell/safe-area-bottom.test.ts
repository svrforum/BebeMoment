import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 화면 아래에 붙는 요소는 하단 안전영역을 비워야 한다.
 *
 * 앱은 edge-to-edge 라 WebView 가 시스템 내비게이션 바 밑까지 그린다. 제스처 내비에선
 * 인셋이 작아 티가 안 나지만 3버튼 내비(약 48dp)에선 사진 뷰어의 좋아요·다운로드·공유 줄이
 * 버튼 바에 통째로 깔렸다. 탭바는 64px 높이 안에 인셋을 넣어 아이콘 자리가 16px 로 눌렸다.
 * 상단 헤더 가드(safe-area-header.test.ts)와 같은 방식으로 소스를 고정한다.
 */

const ROOTS = ['src/components', 'app']

/** 모바일에서 화면 하단에 닿지 않는 곳. 늘릴 때는 이유를 함께 적는다. */
const ALLOWED = new Map<string, string>([
  // 시트 틀 자체 — 인셋은 안쪽 본문(px-5 pt-4 pb-…)과 fill 모드의 하단 바가 비운다.
  ['src/components/ui/sheet-shells.tsx', '인셋을 안쪽 본문에서 처리'],
])

// 반응형 접두사(md: 등)가 붙은 bottom-* 은 데스크톱 전용이라 보지 않는다.
const MOBILE_BOTTOM = /(^|[\s'"`])bottom-/
const ANCHORED = /(^|[\s'"`])(fixed|sticky)(\s|$|['"`])/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('하단에 붙는 요소는 안전영역을 비운다', () => {
  it('fixed/sticky + bottom-* 을 쓰는 곳마다 safe-area-inset-bottom 이 있다', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = file.replace(/\\/g, '/')
        if (ALLOWED.has(rel)) continue
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, i) => {
          if (!ANCHORED.test(line) || !MOBILE_BOTTOM.test(line)) return
          if (/(^|[\s'"`])inset-0(\s|$|['"`])/.test(line)) return
          const window = lines.slice(Math.max(0, i - 1), i + 4).join('\n')
          if (window.includes('safe-area-inset-bottom')) return
          offenders.push(`${rel}:${i + 1}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })

  it('탭바는 인셋을 높이 안이 아니라 바깥에 더한다', () => {
    const src = readFileSync('src/components/shell/bottom-nav.tsx', 'utf8')
    expect(src).not.toMatch(/h-16[^"]*pb-\[env\(safe-area-inset-bottom\)\]/)
  })

  it('허용 목록은 실제로 존재하는 파일만 담는다', () => {
    for (const rel of ALLOWED.keys()) {
      expect(() => statSync(rel)).not.toThrow()
    }
  })
})
