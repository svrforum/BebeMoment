import { describe, expect, it } from 'vitest'
import { hasDependentDescendant } from './retention'

describe('hasDependentDescendant', () => {
  const chain = [
    { id: 'full', parentId: null },
    { id: 'i1', parentId: 'full' },
    { id: 'i2', parentId: 'i1' },
  ]

  it('full 베이스나 중간 incr 에 의존하는 후손이 있으면 true', () => {
    expect(hasDependentDescendant(chain, 'full')).toBe(true)
    expect(hasDependentDescendant(chain, 'i1')).toBe(true)
  })

  it('체인 끝(후손 없음)이면 false', () => {
    expect(hasDependentDescendant(chain, 'i2')).toBe(false)
  })

  it('독립 full 백업은 false', () => {
    const two = [
      { id: 'full', parentId: null },
      { id: 'full2', parentId: null },
    ]
    expect(hasDependentDescendant(two, 'full')).toBe(false)
  })
})
