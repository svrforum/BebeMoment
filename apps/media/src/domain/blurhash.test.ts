import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { computeBlurhash } from './blurhash'

describe('computeBlurhash', () => {
  test('returns string for a real image buffer', async () => {
    const buf = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toBuffer()

    const hash = await computeBlurhash(buf)
    expect(typeof hash).toBe('string')
    expect((hash ?? '').length).toBeGreaterThanOrEqual(20)
    expect((hash ?? '').length).toBeLessThanOrEqual(40)
  })

  test('returns null for invalid buffer', async () => {
    const hash = await computeBlurhash(Buffer.from('not-an-image'))
    expect(hash).toBeNull()
  })
})
