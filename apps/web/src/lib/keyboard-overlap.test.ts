import { describe, expect, it } from 'vitest'
import { keyboardOverlaysLayout } from './keyboard-overlap'

describe('keyboardOverlaysLayout', () => {
  it('sees a keyboard that floats over an unchanged layout viewport', () => {
    expect(keyboardOverlaysLayout(844, 494)).toBe(true)
  })

  it('sees no overlay when the layout viewport shrank with the keyboard', () => {
    expect(keyboardOverlaysLayout(494, 494)).toBe(false)
  })

  it('ignores small wobble like a collapsing address bar', () => {
    expect(keyboardOverlaysLayout(844, 800)).toBe(false)
  })

  it('treats a visual viewport larger than the layout one as no overlay', () => {
    expect(keyboardOverlaysLayout(494, 844)).toBe(false)
  })
})
