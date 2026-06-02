import { describe, expect, it } from 'vitest'
import { orientedDimensions, parseDurationMs, streamRotation } from './video-meta'

describe('parseDurationMs', () => {
  it('converts seconds to ms', () => {
    expect(parseDurationMs('12.5')).toBe(12500)
    expect(parseDurationMs(3)).toBe(3000)
  })
  it('returns 0 for non-finite/garbage durations (ffprobe emits "N/A")', () => {
    expect(parseDurationMs('N/A')).toBe(0)
    expect(parseDurationMs(undefined)).toBe(0)
    expect(parseDurationMs(null)).toBe(0)
    expect(parseDurationMs(Number.NaN)).toBe(0)
  })
})

describe('streamRotation', () => {
  it('reads legacy tags.rotate', () => {
    expect(streamRotation({ tags: { rotate: '90' } })).toBe(90)
    expect(streamRotation({ tags: { rotate: '-90' } })).toBe(270)
  })
  it('prefers side_data displaymatrix rotation', () => {
    expect(streamRotation({ side_data_list: [{ rotation: -90 }] })).toBe(270)
    expect(streamRotation({ side_data_list: [{ rotation: 180 }] })).toBe(180)
  })
  it('defaults to 0 with no rotation info', () => {
    expect(streamRotation({})).toBe(0)
    expect(streamRotation(undefined)).toBe(0)
  })
})

describe('orientedDimensions', () => {
  it('swaps width/height for 90/270 rotation (portrait phone video)', () => {
    expect(orientedDimensions({ width: 1920, height: 1080, tags: { rotate: '90' } })).toEqual({
      width: 1080,
      height: 1920,
    })
    expect(
      orientedDimensions({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }),
    ).toEqual({
      width: 1080,
      height: 1920,
    })
  })
  it('leaves dimensions for 0/180 rotation', () => {
    expect(orientedDimensions({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 })
    expect(orientedDimensions({ width: 1920, height: 1080, tags: { rotate: '180' } })).toEqual({
      width: 1920,
      height: 1080,
    })
  })
  it('passes through undefined dims', () => {
    expect(orientedDimensions(undefined)).toEqual({ width: undefined, height: undefined })
  })
})
