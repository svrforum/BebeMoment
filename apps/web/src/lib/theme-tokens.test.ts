import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const GLOBALS_CSS = path.join(ROOT, 'app/globals.css')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules' && name !== '.next') out.push(...tsxFiles(full))
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

/** `@theme { … }` 블록 본문 — keyframes 가 중첩되므로 중괄호 깊이를 세어 끝을 찾는다. */
function themeBlock(css: string): string {
  const start = css.indexOf('@theme')
  if (start < 0) return ''
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  return ''
}

// Tailwind 가 기본 제공하는 유틸리티는 토큰 없이도 CSS 가 나온다 — 그 목록만 제외한다.
const BUILTIN_ANIMATIONS = new Set(['spin', 'ping', 'pulse', 'bounce', 'none'])
const BUILTIN_EASINGS = new Set(['linear', 'in', 'out', 'in-out', 'initial'])
const BUILTIN_FONTS = new Set(['sans', 'serif', 'mono'])
const BUILTIN_SHADOWS = new Set([
  '2xs',
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
  '2xl',
  'none',
  'inherit',
  'current',
  'transparent',
  'black',
  'white',
])
// rounded-2xl / rounded-3xl 은 기본값(16px/24px)이 아니라 이 프로젝트의 24px/28px 를
// 쓰기로 했다 — 토큰이 빠지면 조용히 기본값으로 돌아가므로 여기서 잡는다.
const OVERRIDDEN_RADII = new Set(['2xl', '3xl'])

type Namespace = 'shadow' | 'ease' | 'font' | 'animate' | 'radius'

function customUtilities(src: string): { utility: string; token: string }[] {
  const found: { utility: string; token: string }[] = []
  const push = (utility: string, ns: Namespace, name: string) =>
    found.push({ utility, token: `--${ns}-${name}` })
  for (const m of src.matchAll(/\bshadow-([a-z0-9-]+)/g)) {
    const name = m[1] ?? ''
    if (!BUILTIN_SHADOWS.has(name) && !/^\[|^\(|^(?:[a-z]+-\d+)/.test(name))
      push(m[0], 'shadow', name)
  }
  for (const m of src.matchAll(/\bease-([a-z0-9-]+)/g)) {
    const name = m[1] ?? ''
    if (!BUILTIN_EASINGS.has(name) && !name.startsWith('[')) push(m[0], 'ease', name)
  }
  for (const m of src.matchAll(/\bfont-([a-z]+)\b/g)) {
    const name = m[1] ?? ''
    if (
      !BUILTIN_FONTS.has(name) &&
      !/^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|stretch)$/.test(name)
    )
      push(m[0], 'font', name)
  }
  for (const m of src.matchAll(/\banimate-([a-z0-9-]+)/g)) {
    const name = m[1] ?? ''
    if (!BUILTIN_ANIMATIONS.has(name) && !name.startsWith('[')) push(m[0], 'animate', name)
  }
  for (const m of src.matchAll(/\brounded-(?:[trbl]{1,2}-|[se]{1,2}-)?(2xl|3xl)\b/g)) {
    const name = m[1] ?? ''
    if (OVERRIDDEN_RADII.has(name)) push(m[0], 'radius', name)
  }
  return found
}

/**
 * Tailwind v4 는 `tailwind.config.ts` 를 읽지 않는다 — 토큰은 `@theme` 에만 산다. 예전 설정
 * 파일에만 있던 shadow-card·ease-ios 같은 유틸리티는 소스에 수십 번 쓰였는데 CSS 는 0줄이
 * 나왔다. 소스에 쓰인 커스텀 유틸리티마다 대응 토큰이 `@theme` 에 있는지 정적으로 본다.
 */
describe('@theme 은 소스가 쓰는 커스텀 유틸리티 토큰을 전부 정의한다', () => {
  const css = readFileSync(GLOBALS_CSS, 'utf8')
  const theme = themeBlock(css)
  const files = [...tsxFiles(path.join(ROOT, 'src')), ...tsxFiles(path.join(ROOT, 'app'))]

  it('tailwind.config.ts 는 더 이상 없다(있어도 읽히지 않으므로 혼란만 준다)', () => {
    expect(() => statSync(path.join(ROOT, 'tailwind.config.ts'))).toThrow()
  })

  it('사용된 유틸리티마다 토큰이 있다', () => {
    const missing = new Map<string, Set<string>>()
    // shadow-danger/40 처럼 색 토큰을 그림자 색으로 쓰는 유틸리티는 --color-* 로 충족된다.
    const defined = (token: string) =>
      theme.includes(`${token}:`) ||
      (token.startsWith('--shadow-') && theme.includes(`--color-${token.slice(9)}:`))
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const { utility, token } of customUtilities(src)) {
        if (!defined(token)) {
          const set = missing.get(token) ?? new Set()
          set.add(`${path.relative(ROOT, file)} (${utility})`)
          missing.set(token, set)
        }
      }
    }
    const report = [...missing.entries()].map(
      ([token, uses]) =>
        `${token} ← ${[...uses].slice(0, 3).join(', ')}${uses.size > 3 ? ' …' : ''}`,
    )
    expect(report).toEqual([])
  })

  it('본문 폰트는 Pretendard 가 먼저 온다', () => {
    const m = theme.match(/--font-sans:\s*([^;]+);/)
    expect(m?.[1]?.trim()).toMatch(/^["']Pretendard Variable["']/)
  })

  it('rounded-2xl / rounded-3xl 은 24px / 28px 다', () => {
    expect(theme).toMatch(/--radius-2xl:\s*24px;/)
    expect(theme).toMatch(/--radius-3xl:\s*28px;/)
  })

  it('토스트 진입·퇴장 애니메이션은 keyframes 까지 @theme 안에 있다', () => {
    for (const name of ['toast-in', 'toast-out']) {
      expect(theme).toContain(`--animate-${name}:`)
      expect(theme).toContain(`@keyframes ${name}`)
    }
  })
})
