import { describe, expect, it } from 'vitest'
import { type BucketGroup, estimateSectionHeight, mergeGroups, reconcileHead } from './groups'

function asset(id: string) {
  return {
    id,
    publicNo: Number(id.replace(/\D/g, '')) || 0,
    status: 'ready' as const,
    kind: 'image' as const,
    urls: null,
  }
}

function group(dateKey: string, ids: string[]): BucketGroup {
  return { dateKey, label: dateKey, assets: ids.map(asset) }
}

const idsOf = (gs: BucketGroup[]) => gs.map((g) => [g.dateKey, g.assets.map((a) => a.id)])
const headIds = (loaded: BucketGroup[], fresh: BucketGroup[]) =>
  idsOf(reconcileHead(loaded, fresh).groups)

describe('mergeGroups', () => {
  it('appends a page and merges the seam day without duplicating assets', () => {
    const prev = [group('2026-05-02', ['a', 'b']), group('2026-05-01', ['c'])]
    const next = [group('2026-05-01', ['c', 'd']), group('2026-04-30', ['e'])]
    expect(idsOf(mergeGroups(prev, next))).toEqual([
      ['2026-05-02', ['a', 'b']],
      ['2026-05-01', ['c', 'd']],
      ['2026-04-30', ['e']],
    ])
  })

  it('returns the previous list untouched for an empty page', () => {
    const prev = [group('2026-05-02', ['a'])]
    expect(mergeGroups(prev, [])).toBe(prev)
  })
})

describe('reconcileHead', () => {
  it('keeps every page the viewer already loaded when a fresh first page arrives', () => {
    // three pages loaded, then a refresh returns only the first page again.
    const loaded = [
      group('2026-05-03', ['a1', 'a2']),
      group('2026-05-02', ['b1', 'b2']),
      group('2026-05-01', ['c1', 'c2']),
    ]
    const fresh = [group('2026-05-03', ['a1', 'a2']), group('2026-05-02', ['b1'])]
    expect(headIds(loaded, fresh)).toEqual([
      ['2026-05-03', ['a1', 'a2']],
      ['2026-05-02', ['b1', 'b2']],
      ['2026-05-01', ['c1', 'c2']],
    ])
  })

  it('prepends photos that appeared while the viewer was scrolled', () => {
    const loaded = [group('2026-05-03', ['a1']), group('2026-05-01', ['c1'])]
    const fresh = [group('2026-05-04', ['new1']), group('2026-05-03', ['a1'])]
    expect(headIds(loaded, fresh)).toEqual([
      ['2026-05-04', ['new1']],
      ['2026-05-03', ['a1']],
      ['2026-05-01', ['c1']],
    ])
  })

  it('drops assets the fresh page no longer lists above its boundary', () => {
    const loaded = [group('2026-05-03', ['a1', 'gone', 'a2']), group('2026-05-01', ['c1'])]
    const fresh = [group('2026-05-03', ['a1', 'a2'])]
    expect(headIds(loaded, fresh)).toEqual([
      ['2026-05-03', ['a1', 'a2']],
      ['2026-05-01', ['c1']],
    ])
  })

  it('falls back to the fresh page when the two lists do not overlap', () => {
    const loaded = [group('2026-01-02', ['x'])]
    const fresh = [group('2026-05-03', ['a1'])]
    expect(headIds(loaded, fresh)).toEqual([['2026-05-03', ['a1']]])
  })

  it('takes the fresh page verbatim when nothing was loaded or everything is gone', () => {
    expect(reconcileHead([], [group('2026-05-03', ['a1'])])).toEqual({
      groups: [group('2026-05-03', ['a1'])],
      keptPages: false,
    })
    expect(reconcileHead([group('2026-05-03', ['a1'])], [])).toEqual({
      groups: [],
      keptPages: false,
    })
  })

  it('reports whether the deeper pages survived', () => {
    const loaded = [group('2026-05-03', ['a1', 'a2']), group('2026-05-01', ['c1'])]
    expect(reconcileHead(loaded, [group('2026-05-03', ['a1'])]).keptPages).toBe(true)
    expect(reconcileHead(loaded, [group('2025-01-01', ['z'])]).keptPages).toBe(false)
  })

  it('keeps the fresh stories for the boundary day', () => {
    const loaded: BucketGroup[] = [{ ...group('2026-05-03', ['a1', 'a2']), stories: [] }]
    const story = { id: 's1' } as unknown as NonNullable<BucketGroup['stories']>[number]
    const fresh: BucketGroup[] = [{ ...group('2026-05-03', ['a1']), stories: [story] }]
    const out = reconcileHead(loaded, fresh).groups
    expect(out[0]?.stories).toEqual([story])
    expect(out[0]?.assets.map((a) => a.id)).toEqual(['a1', 'a2'])
  })
})

describe('estimateSectionHeight', () => {
  it('grows with the number of rows the section renders', () => {
    const one = estimateSectionHeight({ assetCount: 1, storyCount: 0 })
    const two = estimateSectionHeight({ assetCount: 4, storyCount: 0 })
    expect(two).toBeGreaterThan(one)
  })

  it('stops growing past the collapsed row budget', () => {
    const six = estimateSectionHeight({ assetCount: 6, storyCount: 0 })
    const hundred = estimateSectionHeight({ assetCount: 100, storyCount: 0 })
    // 접힌 상태에서는 6장만 그려지므로 추정 높이도 더보기 버튼만큼만 커진다.
    expect(hundred - six).toBeLessThan(100)
  })

  it('accounts for stories above the grid', () => {
    expect(estimateSectionHeight({ assetCount: 3, storyCount: 1 })).toBeGreaterThan(
      estimateSectionHeight({ assetCount: 3, storyCount: 0 }),
    )
  })

  it('never returns a non-positive size', () => {
    expect(estimateSectionHeight({ assetCount: 0, storyCount: 0 })).toBeGreaterThan(0)
  })
})
