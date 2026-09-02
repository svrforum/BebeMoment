import { describe, expect, it } from 'vitest'
import { applyStoryOrder } from './story-order'

type Item = { kind: 'asset' | 'story'; id: string }

const order = (pairs: [string, string, number][]) =>
  new Map(pairs.map(([assetId, storyId, o]) => [assetId, { storyId, order: o }]))

describe('applyStoryOrder', () => {
  // 타임라인은 하루 안에서 최신 먼저(takenAt DESC)로 늘어놓는데, 스토리 사진은 대개
  // 찍은 순서대로 담기므로 정확히 뒤집혀 보였다. 스토리에 속한 사진은 사용자가 정한
  // 순서를 따라야 한다.
  it('스토리 사진을 지정 순서로 되돌린다', () => {
    const items: Item[] = [
      { kind: 'asset', id: 'c' },
      { kind: 'asset', id: 'b' },
      { kind: 'asset', id: 'a' },
    ]
    const out = applyStoryOrder(
      items,
      order([
        ['a', 's1', 0],
        ['b', 's1', 1],
        ['c', 's1', 2],
      ]),
    )
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('스토리 묶음은 그 스토리가 원래 나타나던 자리에 둔다', () => {
    const items: Item[] = [
      { kind: 'asset', id: 'x' },
      { kind: 'asset', id: 'c' },
      { kind: 'asset', id: 'a' },
      { kind: 'asset', id: 'y' },
    ]
    const out = applyStoryOrder(
      items,
      order([
        ['a', 's1', 0],
        ['c', 's1', 1],
      ]),
    )
    expect(out.map((i) => i.id)).toEqual(['x', 'a', 'c', 'y'])
  })

  it('스토리에 안 속한 사진의 순서는 건드리지 않는다', () => {
    const items: Item[] = [
      { kind: 'asset', id: 'p' },
      { kind: 'asset', id: 'q' },
    ]
    expect(applyStoryOrder(items, order([])).map((i) => i.id)).toEqual(['p', 'q'])
  })

  it('스토리가 여럿이면 각자 자기 자리에서 정렬된다', () => {
    const items: Item[] = [
      { kind: 'asset', id: 'b2' },
      { kind: 'asset', id: 'a2' },
      { kind: 'asset', id: 'b1' },
      { kind: 'asset', id: 'a1' },
    ]
    const out = applyStoryOrder(
      items,
      order([
        ['a1', 'A', 0],
        ['a2', 'A', 1],
        ['b1', 'B', 0],
        ['b2', 'B', 1],
      ]),
    )
    expect(out.map((i) => i.id)).toEqual(['b1', 'b2', 'a1', 'a2'])
  })

  it('스토리 항목(kind=story)은 그대로 둔다', () => {
    const items: Item[] = [
      { kind: 'story', id: 's1' },
      { kind: 'asset', id: 'b' },
      { kind: 'asset', id: 'a' },
    ]
    const out = applyStoryOrder(
      items,
      order([
        ['a', 's1', 0],
        ['b', 's1', 1],
      ]),
    )
    expect(out.map((i) => `${i.kind}:${i.id}`)).toEqual(['story:s1', 'asset:a', 'asset:b'])
  })

  it('일부만 페이지에 있으면 있는 것만 정렬한다', () => {
    const items: Item[] = [
      { kind: 'asset', id: 'c' },
      { kind: 'asset', id: 'a' },
    ]
    const out = applyStoryOrder(
      items,
      order([
        ['a', 's1', 0],
        ['b', 's1', 1],
        ['c', 's1', 2],
      ]),
    )
    expect(out.map((i) => i.id)).toEqual(['a', 'c'])
  })
})
