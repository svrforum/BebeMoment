import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import { computeBlurhash, encodeBlurhash } from './blurhash'

describe('encodeBlurhash', () => {
  test('encodes an RGBA raw preview and matches the decode-based path', async () => {
    const png = await sharp({
      create: { width: 200, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toBuffer()
    const raw = await sharp(png)
      .resize(64, 64, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const fromRaw = encodeBlurhash({ data: raw.data, info: raw.info })
    expect(fromRaw).toBe(await computeBlurhash(png))
  })

  test('returns null for a raw buffer that is not RGBA', () => {
    expect(
      encodeBlurhash({ data: Buffer.from([1, 2, 3]), info: { width: 1, height: 1, channels: 3 } }),
    ).toBeNull()
  })
})

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
