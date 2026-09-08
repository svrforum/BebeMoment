import { describe, expect, it } from 'vitest'
import {
  FACE_NEAR_IN_TIME_BONUS,
  FACE_NEAR_IN_TIME_DAYS,
  chooseCluster,
} from '@/domain/face-cluster'

const opts = { maxDistance: 0.45 }

describe('chooseCluster', () => {
  it('takes the nearest face when it is inside the plain threshold', () => {
    expect(chooseCluster([{ personId: 'a', dist: 0.3, gapDays: 900 }], opts)).toBe('a')
  })

  it('leaves a far face alone even when it was taken the same day', () => {
    expect(chooseCluster([{ personId: 'a', dist: 0.8, gapDays: 0 }], opts)).toBeNull()
  })

  it('accepts a face just past the threshold when the photos are days apart, not months', () => {
    const justPast = 0.45 + FACE_NEAR_IN_TIME_BONUS / 2
    expect(chooseCluster([{ personId: 'a', dist: justPast, gapDays: 3 }], opts)).toBe('a')
    expect(chooseCluster([{ personId: 'a', dist: justPast, gapDays: 400 }], opts)).toBeNull()
  })

  it('holds the line at the edge of the near-in-time window', () => {
    const justPast = 0.45 + FACE_NEAR_IN_TIME_BONUS / 2
    expect(
      chooseCluster([{ personId: 'a', dist: justPast, gapDays: FACE_NEAR_IN_TIME_DAYS }], opts),
    ).toBe('a')
    expect(
      chooseCluster(
        [{ personId: 'a', dist: justPast, gapDays: FACE_NEAR_IN_TIME_DAYS + 0.5 }],
        opts,
      ),
    ).toBeNull()
  })

  it('never stretches past the configured maximum', () => {
    expect(
      chooseCluster([{ personId: 'a', dist: 0.95, gapDays: 0 }], { maxDistance: 0.9 }),
    ).toBeNull()
  })

  it('falls back to the plain threshold when the photo has no date', () => {
    const justPast = 0.45 + FACE_NEAR_IN_TIME_BONUS / 2
    expect(chooseCluster([{ personId: 'a', dist: justPast, gapDays: null }], opts)).toBeNull()
    expect(chooseCluster([{ personId: 'a', dist: 0.4, gapDays: null }], opts)).toBe('a')
  })

  it('prefers a slightly farther but recent face over a nearer but ancient one only when the near one fits', () => {
    const candidates = [
      { personId: 'ancient', dist: 0.47, gapDays: 500 },
      { personId: 'recent', dist: 0.5, gapDays: 2 },
    ]
    // 벡터 거리 순서를 존중하되, 첫 후보가 임계값 밖이면 다음 후보를 본다.
    expect(chooseCluster(candidates, opts)).toBe('recent')
  })

  it('ignores a candidate whose distance is not a number', () => {
    expect(
      chooseCluster(
        [
          { personId: 'broken', dist: Number.NaN, gapDays: 0 },
          { personId: 'good', dist: 0.2, gapDays: 0 },
        ],
        opts,
      ),
    ).toBe('good')
  })
})
