import { describe, expect, test } from 'vitest'
import { averageColor, rgbToHex } from './color'

function rawOf(pixels: Array<[number, number, number, number]>, width: number) {
  const data = Buffer.from(pixels.flat())
  return { data, info: { width, height: pixels.length / width, channels: 4 } }
}

describe('rgbToHex', () => {
  test('clamps and pads', () => {
    expect(rgbToHex(0, 15.6, 300)).toBe('#0010ff')
  })
})

describe('averageColor', () => {
  test('averages the RGB channels of an RGBA raw buffer, ignoring alpha', () => {
    const raw = rawOf(
      [
        [255, 0, 0, 255],
        [0, 0, 255, 0],
      ],
      2,
    )
    expect(averageColor(raw)).toBe('#800080')
  })

  test('handles RGB (3-channel) raw buffers', () => {
    const data = Buffer.from([10, 20, 30, 30, 40, 50])
    expect(averageColor({ data, info: { width: 2, height: 1, channels: 3 } })).toBe('#141e28')
  })

  test('returns null for unsupported channel counts or empty buffers', () => {
    expect(
      averageColor({ data: Buffer.alloc(0), info: { width: 0, height: 0, channels: 4 } }),
    ).toBe(null)
    expect(
      averageColor({ data: Buffer.from([1, 2]), info: { width: 2, height: 1, channels: 1 } }),
    ).toBe(null)
  })
})
