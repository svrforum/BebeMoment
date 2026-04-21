import { describe, expect, it } from 'vitest'
import { groupAssetsByBucket } from './group-by-bucket'

type A = { id: string; takenAt: Date }

describe('groupAssetsByBucket', () => {
  it('groups assets by bucket label using baby birth date', () => {
    const birth = new Date('2026-01-01')
    const assets: A[] = [
      { id: 'a', takenAt: new Date('2026-01-01') },
      { id: 'b', takenAt: new Date('2026-01-02') },
      { id: 'c', takenAt: new Date('2026-04-15') },
      { id: 'd', takenAt: new Date('2027-01-01') },
    ]
    const groups = groupAssetsByBucket(assets, birth)
    // Sort by latest-first
    expect(groups.map((g) => g.label)).toEqual(['1주년 (돌)', '생후 3개월', '생후 2일', '생후 1일'])
    expect(groups[0]?.assets.map((a) => a.id)).toEqual(['d'])
    expect(groups[1]?.assets.map((a) => a.id)).toEqual(['c'])
  })

  it('returns empty array for no assets', () => {
    expect(groupAssetsByBucket([], new Date())).toEqual([])
  })

  it('groups multiple assets with same bucket together', () => {
    const birth = new Date('2026-01-01')
    const assets: A[] = [
      { id: 'a', takenAt: new Date('2026-01-01T09:00:00') },
      { id: 'b', takenAt: new Date('2026-01-01T18:00:00') },
    ]
    const groups = groupAssetsByBucket(assets, birth)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.assets).toHaveLength(2)
  })
})
