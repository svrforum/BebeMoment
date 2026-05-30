import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createAdapter } from '@bebe/storage'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { processImage } from './image-pipeline'

describe('processImage', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-image-test-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('produces 9 variants (3 sizes × 3 formats) + blurhash + dominantColor + aspectRatio', async () => {
    const buf = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 100, g: 50, b: 200 } },
    })
      .png()
      .toBuffer()
    const adapter = createAdapter({ mode: 'local', path: dir })
    await adapter.writeBuffer('originals/test.png', buf, 'image/png')

    const r = await processImage({ originalKey: 'originals/test.png', assetId: 'asset-1' }, adapter)

    expect(r.derivatives.v).toBe(2)
    expect(r.derivatives.thumb256.avif).toContain('asset-1')
    expect(r.derivatives.thumb256.webp).toContain('asset-1')
    expect(r.derivatives.thumb256.jpeg).toContain('asset-1')
    expect(r.derivatives.thumb512.avif).toBeDefined()
    expect(r.derivatives.display1080.jpeg).toBeDefined()

    expect(r.blurhash).toBeTruthy()
    expect(r.dominantColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(r.aspectRatio).toBeCloseTo(1600 / 900, 3)

    const expected = [
      'derivatives/asset-1/thumb256.avif',
      'derivatives/asset-1/thumb256.webp',
      'derivatives/asset-1/thumb256.jpeg',
      'derivatives/asset-1/thumb512.avif',
      'derivatives/asset-1/thumb512.webp',
      'derivatives/asset-1/thumb512.jpeg',
      'derivatives/asset-1/display1080.avif',
      'derivatives/asset-1/display1080.webp',
      'derivatives/asset-1/display1080.jpeg',
    ]
    for (const key of expected) {
      expect(fs.existsSync(path.join(dir, key))).toBe(true)
    }
  }, 60_000)

  test('skips AVIF when MEDIA_DERIVATIVES_INCLUDE_AVIF=false', async () => {
    const orig = process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF
    process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF = 'false'
    try {
      const buf = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 50, g: 50, b: 50 } },
      })
        .png()
        .toBuffer()
      const adapter = createAdapter({ mode: 'local', path: dir })
      await adapter.writeBuffer('originals/test.png', buf, 'image/png')

      const r = await processImage(
        { originalKey: 'originals/test.png', assetId: 'asset-2' },
        adapter,
      )

      expect(fs.existsSync(path.join(dir, 'derivatives/asset-2/thumb256.webp'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'derivatives/asset-2/thumb256.jpeg'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'derivatives/asset-2/thumb256.avif'))).toBe(false)
      expect(r.derivatives.thumb256.avif).toBe(r.derivatives.thumb256.webp)
    } finally {
      if (orig === undefined) delete process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF
      else process.env.MEDIA_DERIVATIVES_INCLUDE_AVIF = orig
    }
  }, 30_000)
})
