import { describe, expect, it } from 'vitest'
import { moveKey } from './reorder-move'

describe('moveKey', () => {
  const keys = ['a', 'b', 'c', 'd']

  it('뒤쪽 항목을 앞으로 가져온다 — 사진이 많으면 드래그로는 불가능한 이동', () => {
    expect(moveKey(keys, 'd', 'a')).toEqual(['d', 'a', 'b', 'c'])
  })

  it('앞쪽 항목을 뒤로 보낸다', () => {
    expect(moveKey(keys, 'a', 'd')).toEqual(['b', 'c', 'd', 'a'])
  })

  it('바로 옆으로도 옮긴다', () => {
    expect(moveKey(keys, 'c', 'b')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('자기 자신을 대상으로 하면 그대로', () => {
    expect(moveKey(keys, 'b', 'b')).toEqual(keys)
  })

  it('없는 키는 아무것도 바꾸지 않는다', () => {
    expect(moveKey(keys, 'z', 'a')).toEqual(keys)
    expect(moveKey(keys, 'a', 'z')).toEqual(keys)
  })

  it('원본 배열을 건드리지 않는다', () => {
    const original = [...keys]
    moveKey(keys, 'd', 'a')
    expect(keys).toEqual(original)
  })
})
