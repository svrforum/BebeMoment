import { SHARE_SELECTION_MAX } from '@/lib/share-limits'
import { describe, expect, it } from 'vitest'
import { memoryShareIds } from './share-ids'

const asset = (id: string) => ({ id })

describe('memoryShareIds', () => {
  it('keeps the order the memory shows its photos in', () => {
    expect(memoryShareIds([asset('c'), asset('a'), asset('b')], new Set())).toEqual(['c', 'a', 'b'])
  })

  // 보호자는 비밀 스토리 사진도 추억에서 보지만, 공개 링크에서는 어차피 빠진다 — 처음부터 담지
  // 않아야 시트가 말하는 장수와 받는 사람이 보는 장수가 같다.
  it('leaves out photos that belong to a guardians-only story', () => {
    expect(memoryShareIds([asset('a'), asset('s'), asset('b')], new Set(['s']))).toEqual(['a', 'b'])
  })

  it('stops at what one link can hold', () => {
    const many = Array.from({ length: SHARE_SELECTION_MAX + 5 }, (_, i) => asset(`p${i}`))
    const ids = memoryShareIds(many, new Set())
    expect(ids).toHaveLength(SHARE_SELECTION_MAX)
    expect(ids[0]).toBe('p0')
  })

  it('is empty when every photo is secret', () => {
    expect(memoryShareIds([asset('s')], new Set(['s']))).toEqual([])
  })
})
