import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { LocalAdapter } from '@bebe/storage'
import { processImage } from './image-pipeline'

let tmp: string
let storage: LocalAdapter

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'bebe-img-'))
  storage = new LocalAdapter({ mode: 'local', path: tmp })

  const sample = await sharp({
    create: { width: 2000, height: 1500, channels: 3, background: '#ff00ff' },
  })
    .jpeg()
    .toBuffer()
  await storage.writeBuffer('originals/sample.jpg', sample)
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('processImage', () => {
  it('generates 3 WebP thumbnails and records dimensions', async () => {
    const result = await processImage(
      { originalKey: 'originals/sample.jpg', assetId: 'asset-1' },
      storage,
    )
    expect(result.derivatives.thumb_sm).toBeTruthy()
    expect(result.derivatives.thumb_md).toBeTruthy()
    expect(result.derivatives.thumb_lg).toBeTruthy()
    expect(result.width).toBe(2000)
    expect(result.height).toBe(1500)

    const smRaw = await storage.read(result.derivatives.thumb_sm)
    const smBuf = await collect(smRaw)
    const smMeta = await sharp(smBuf).metadata()
    expect(Math.max(smMeta.width ?? 0, smMeta.height ?? 0)).toBeLessThanOrEqual(320)
    expect(smMeta.format).toBe('webp')
  })
})
