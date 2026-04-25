import { describe, expect, test } from 'vitest'
import {
  computePath,
  depthFromPath,
  isDescendant,
  parentIdFromPath,
  rewritePathPrefix,
} from './path'

describe('album path helpers', () => {
  test('computePath builds slash-separated chain', () => {
    expect(computePath(null, 'a')).toBe('a')
    expect(computePath('a', 'b')).toBe('a/b')
    expect(computePath('a/b', 'c')).toBe('a/b/c')
  })

  test('depthFromPath counts segments', () => {
    expect(depthFromPath('a')).toBe(0)
    expect(depthFromPath('a/b')).toBe(1)
    expect(depthFromPath('a/b/c')).toBe(2)
  })

  test('parentIdFromPath returns penultimate or null', () => {
    expect(parentIdFromPath('a')).toBeNull()
    expect(parentIdFromPath('a/b')).toBe('a')
    expect(parentIdFromPath('a/b/c')).toBe('b')
  })

  test('isDescendant catches self + all descendants but not siblings', () => {
    expect(isDescendant('a', 'a')).toBe(true)
    expect(isDescendant('a/b', 'a')).toBe(true)
    expect(isDescendant('a/b/c', 'a')).toBe(true)
    expect(isDescendant('a', 'b')).toBe(false)
    // Critical: prefix-equal-but-not-segment-boundary should NOT match.
    // 'ab/x' is not a descendant of 'a' even though the string starts the
    // same — without the slash check we'd false-positive.
    expect(isDescendant('ab/x', 'a')).toBe(false)
    expect(isDescendant('a-different/x', 'a')).toBe(false)
  })

  test('rewritePathPrefix swaps the moved-from prefix only', () => {
    expect(rewritePathPrefix('a', 'a', 'x')).toBe('x')
    expect(rewritePathPrefix('a/b', 'a', 'x')).toBe('x/b')
    expect(rewritePathPrefix('a/b/c', 'a/b', 'x/y')).toBe('x/y/c')
    // Unrelated paths are untouched.
    expect(rewritePathPrefix('z/a', 'a', 'x')).toBe('z/a')
    // Prefix-equal-but-not-segment-boundary must NOT match.
    expect(rewritePathPrefix('ab', 'a', 'x')).toBe('ab')
  })
})
