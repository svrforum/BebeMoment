import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 화면 맨 위에 붙는 헤더는 상단 안전영역을 비워야 한다.
 *
 * 이 앱은 `viewportFit: 'cover'` 라 뷰포트가 상태바 아래까지 올라간다. `sticky top-0` 헤더가
 * `env(safe-area-inset-top)` 을 비우지 않으면 뒤로가기·수정 같은 줄이 통째로 상태바에 깔려
 * 사라진다 — 일정 상세 화면에서 실제로 그랬다. AppHeader 는 진작부터 비우고 있었고, 자체
 * 헤더를 만든 화면들만 빠뜨렸다. 새 헤더가 같은 실수를 반복하지 않도록 소스로 고정한다.
 */

const ROOTS = ['src/components', 'app']

/** 페이지 최상단 헤더가 아니라서 상단 인셋이 필요 없는 곳. 늘릴 때는 이유를 함께 적는다. */
const ALLOWED = new Map<string, string>([
  // 인셋이 바깥이 아니라 안쪽 행(pt-[calc(env(safe-area-inset-top)+35px)])에 걸려 있다.
  ['src/components/shell/app-header.tsx', '인셋을 안쪽 행에서 처리'],
  // 사진 뷰어의 정보 패널 — 시트 안에서 스티키라 화면 상단이 아니다.
  ['src/components/detail/viewer-info-panel.tsx', '뷰어 시트 내부'],
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('상단 스티키 헤더는 안전영역을 비운다', () => {
  it('sticky top-0 을 쓰는 헤더마다 safe-area-inset-top 이 있다', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const rel = file.replace(/\\/g, '/')
        if (ALLOWED.has(rel)) continue
        const lines = readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, i) => {
          if (!line.includes('sticky top-0')) return
          const window = lines.slice(i, i + 4).join('\n')
          if (window.includes('safe-area-inset-top')) return
          offenders.push(`${rel}:${i + 1}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })

  it('허용 목록은 실제로 존재하는 파일만 담는다', () => {
    for (const rel of ALLOWED.keys()) {
      expect(() => statSync(rel)).not.toThrow()
    }
  })
})
