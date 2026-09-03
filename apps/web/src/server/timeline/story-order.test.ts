import { describe, expect, it } from 'vitest'
import { groupAssetsByDay } from './group-by-day'
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

describe('groupAssetsByDay 는 하루 안 순서를 보존한다', () => {
  // merged-list 가 스토리 순서를 반영해 넘겨도, 그룹핑이 ts desc 로 다시 정렬하면 그게
  // 통째로 되돌아간다 — 실제로 그래서 8/30 스토리 두 개가 여전히 역순으로 보였다.
  it('받은 순서를 그대로 두고 날짜만 최신순으로 묶는다', () => {
    const d = (iso: string) => new Date(iso)
    const assets = [
      // 같은 날, 일부러 ts 오름차순으로 넘긴다(스토리 순서).
      {
        id: 'a',
        publicNo: 1,
        ts: d('2026-08-30T01:00:00Z'),
        status: 'ready',
        kind: 'image',
        urls: null,
      },
      {
        id: 'b',
        publicNo: 2,
        ts: d('2026-08-30T05:00:00Z'),
        status: 'ready',
        kind: 'image',
        urls: null,
      },
      {
        id: 'c',
        publicNo: 3,
        ts: d('2026-08-30T03:00:00Z'),
        status: 'ready',
        kind: 'image',
        urls: null,
      },
      // 다른 날(더 과거) — 뒤 그룹이어야 한다.
      {
        id: 'z',
        publicNo: 4,
        ts: d('2026-08-29T09:00:00Z'),
        status: 'ready',
        kind: 'image',
        urls: null,
      },
    ] as unknown as Parameters<typeof groupAssetsByDay>[0]

    const groups = groupAssetsByDay(assets, null)
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-08-30', '2026-08-29'])
    expect(groups[0]?.assets.map((a) => a.id)).toEqual(['a', 'b', 'c'])
    expect(groups[1]?.assets.map((a) => a.id)).toEqual(['z'])
  })

  it('날짜가 섞여 들어와도 최신 날부터 묶는다', () => {
    const d = (iso: string) => new Date(iso)
    const assets = [
      {
        id: 'old',
        publicNo: 1,
        ts: d('2026-08-28T10:00:00Z'),
        status: 'ready',
        kind: 'image',
        urls: null,
      },
      {
        id: 'new',
        publicNo: 2,
        ts: d('2026-08-30T10:00:00Z'),
        status: 'ready',
        kind: 'image',
        urls: null,
      },
    ] as unknown as Parameters<typeof groupAssetsByDay>[0]
    const groups = groupAssetsByDay(assets, null)
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-08-30', '2026-08-28'])
  })
})
