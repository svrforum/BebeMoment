import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/
const SRC = path.join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full)
  }
  return out
}

/** 주석을 지운 소스 — 주석의 한국어는 허용(§6.6 은 한/영 혼용 OK). */
function stripComments(src: string): string {
  let out = ''
  let state: 'code' | 'line' | 'block' | 'str' = 'code'
  let quote = ''
  for (let i = 0; i < src.length; ) {
    const c = src[i] as string
    const c2 = src[i + 1]
    if (state === 'code') {
      if (c === '/' && c2 === '/') {
        state = 'line'
        i += 2
      } else if (c === '/' && c2 === '*') {
        state = 'block'
        i += 2
      } else {
        if (c === '"' || c === "'" || c === '`') {
          state = 'str'
          quote = c
        }
        out += c
        i += 1
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out += c
      }
      i += 1
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') {
        state = 'code'
        i += 2
      } else {
        if (c === '\n') out += c
        i += 1
      }
    } else {
      if (c === '\\') {
        out += c + (c2 ?? '')
        i += 2
      } else {
        if (c === quote) state = 'code'
        out += c
        i += 1
      }
    }
  }
  return out
}

/**
 * core 는 web·media·워커가 함께 쓰는 패키지라 next-intl 을 못 쓴다. 여기 한국어 문자열을
 * 두면 영어 UI 에도 그대로 나오고, 그게 실제로 타임라인 헤더·마일스톤·위젯·기능 토글에서
 * 벌어졌다. 문장은 카탈로그(apps/web/messages)로, core 는 구조값(키·kind·수치)만 낸다.
 */
describe('core 는 문장을 만들지 않는다', () => {
  it('src 어디에도 (주석 밖) 한글이 없다', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const stripped = stripComments(readFileSync(file, 'utf8'))
      stripped.split('\n').forEach((line, i) => {
        if (HANGUL.test(line)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
