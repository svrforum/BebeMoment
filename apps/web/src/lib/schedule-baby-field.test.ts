import { describe, expect, it } from 'vitest'
import { babyFieldMode, initialBabyId } from './schedule-baby-field'

const one = [{ id: 'b1', name: '딸기' }]
const two = [
  { id: 'b1', name: '딸기' },
  { id: 'b2', name: '포도' },
]

describe('babyFieldMode', () => {
  it('아기가 없으면 아예 보여주지 않는다', () => {
    expect(babyFieldMode([])).toEqual({ kind: 'hidden' })
  })

  it('한 명이면 그 아기로 고정한다', () => {
    expect(babyFieldMode(one)).toEqual({ kind: 'fixed', babyId: 'b1', name: '딸기' })
  })

  it('두 명 이상이면 고르게 한다', () => {
    expect(babyFieldMode(two)).toEqual({ kind: 'choose' })
  })
})

describe('initialBabyId', () => {
  it('한 명이면 저장된 값이 비어 있어도 그 아기가 채워진다', () => {
    expect(initialBabyId(one, null)).toBe('b1')
  })

  it('한 명이면 저장된 값이 달라도 그 아기로 맞춘다', () => {
    expect(initialBabyId(one, 'stale')).toBe('b1')
  })

  it('여러 명이면 저장된 값을 그대로 둔다', () => {
    expect(initialBabyId(two, 'b2')).toBe('b2')
    expect(initialBabyId(two, null)).toBe('')
  })

  it('아기가 없으면 빈 값이다', () => {
    expect(initialBabyId([], null)).toBe('')
  })
})
