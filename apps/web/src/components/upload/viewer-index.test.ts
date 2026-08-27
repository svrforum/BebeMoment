import { describe, expect, it } from 'vitest'
import { nextViewerIndex } from './viewer-index'

describe('nextViewerIndex', () => {
  it('stays on the same slot so the next photo slides in', () => {
    expect(nextViewerIndex(4, 1)).toBe(1)
  })

  it('steps back when the last photo was removed', () => {
    expect(nextViewerIndex(3, 3)).toBe(2)
  })

  it('signals close when nothing is left', () => {
    expect(nextViewerIndex(0, 0)).toBeNull()
  })

  it('lands on the first photo when the first was removed', () => {
    expect(nextViewerIndex(2, 0)).toBe(0)
  })

  it('clamps a negative index', () => {
    expect(nextViewerIndex(2, -1)).toBe(0)
  })

  it('clamps an index past the end', () => {
    expect(nextViewerIndex(2, 9)).toBe(1)
  })
})
