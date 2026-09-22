import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MIN_TOUCH_TARGET_PX, meetsTouchTarget, tailwindSizePx } from '@/lib/touch-target'
import { describe, expect, it } from 'vitest'

// 체크리스트 줄은 목록이라 빽빽해야 하지만, 손끝으로 누르는 것들이라 하한 아래로는 못 간다.
// 소스의 클래스 상수를 직접 읽어 두 요구가 동시에 지켜지는지 본다.
const source = readFileSync(
  path.join(process.cwd(), 'src/components/schedule/checklist-editor.tsx'),
  'utf8',
)

function classConstant(name: string): string {
  const match = new RegExp(`const ${name} =\\s*'([^']*)'`).exec(source)
  if (!match?.[1]) throw new Error(`${name} 클래스 상수를 찾지 못했다`)
  return match[1]
}

function heightPx(className: string): number {
  const height = className
    .split(/\s+/)
    .filter((token) => token.startsWith('h-'))
    .map(tailwindSizePx)
    .find((px): px is number => px !== null)
  if (height === undefined) throw new Error(`높이를 읽지 못했다: ${className}`)
  return height
}

describe('checklist row sizing', () => {
  it('keeps every control at the touch-target floor', () => {
    expect(meetsTouchTarget(classConstant('INPUT_CLASS'))).toBe(true)
    expect(meetsTouchTarget(classConstant('REMOVE_BUTTON_CLASS'))).toBe(true)
    expect(meetsTouchTarget(classConstant('ADD_BUTTON_CLASS'))).toBe(true)
  })

  it('keeps the row itself at the floor so a 15-item list stays workable', () => {
    expect(heightPx(classConstant('INPUT_CLASS'))).toBeLessThanOrEqual(MIN_TOUCH_TARGET_PX + 4)
  })
})
