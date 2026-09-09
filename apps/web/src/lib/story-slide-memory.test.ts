import { describe, expect, it } from 'vitest'
import { storyEntryIdFromCtx, storySlideKey } from './story-slide-memory'

describe('storyEntryIdFromCtx', () => {
  it('스토리에서 열린 뷰어의 ctx 에서 스토리 id 를 뽑는다', () => {
    expect(storyEntryIdFromCtx('story:abc-123')).toBe('abc-123')
  })

  it('스토리가 아닌 컬렉션·빈 값은 null', () => {
    expect(storyEntryIdFromCtx('album:abc')).toBeNull()
    expect(storyEntryIdFromCtx('story:')).toBeNull()
    expect(storyEntryIdFromCtx(null)).toBeNull()
    expect(storyEntryIdFromCtx(undefined)).toBeNull()
  })
})

describe('storySlideKey', () => {
  it('스토리마다 다른 키를 쓴다', () => {
    expect(storySlideKey('a')).not.toBe(storySlideKey('b'))
  })
})
