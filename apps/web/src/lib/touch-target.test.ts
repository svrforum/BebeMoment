import { describe, expect, it } from 'vitest'
import { MIN_TOUCH_TARGET_PX, meetsTouchTarget, tailwindSizePx } from './touch-target'

describe('tailwindSizePx', () => {
  it('reads the spacing scale as px', () => {
    expect(tailwindSizePx('h-11')).toBe(44)
    expect(tailwindSizePx('w-9')).toBe(36)
    expect(tailwindSizePx('h-1.5')).toBe(6)
  })

  it('reads arbitrary px and rem values', () => {
    expect(tailwindSizePx('h-[44px]')).toBe(44)
    expect(tailwindSizePx('w-[2.75rem]')).toBe(44)
  })

  it('gives up on sizes it cannot resolve', () => {
    expect(tailwindSizePx('w-full')).toBeNull()
    expect(tailwindSizePx('flex-1')).toBeNull()
    expect(tailwindSizePx('h-[env(safe-area-inset-bottom)]')).toBeNull()
  })
})

describe('meetsTouchTarget', () => {
  it('passes a control at the floor', () => {
    expect(meetsTouchTarget('focus-ring flex h-11 w-11 shrink-0 rounded-full')).toBe(true)
    expect(MIN_TOUCH_TARGET_PX).toBe(44)
  })

  it('fails a control below the floor', () => {
    expect(meetsTouchTarget('flex h-9 w-9 rounded-full')).toBe(false)
    expect(meetsTouchTarget('h-11 w-9')).toBe(false)
  })

  it('ignores sizes that are not a fixed number of px', () => {
    expect(meetsTouchTarget('h-11 w-full flex-1 rounded-xl')).toBe(true)
  })

  it('fails when no height is pinned at all — an unknown size is not a guarantee', () => {
    expect(meetsTouchTarget('rounded-full px-3')).toBe(false)
    expect(meetsTouchTarget('w-11 rounded-full')).toBe(false)
  })
})
