import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { LocalAdapter } from '@bebe/storage'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { convertImageIfNeeded } from './convert'

let tmp: string
let storage: LocalAdapter

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'bebe-cvt-'))
  storage = new LocalAdapter({ mode: 'local', path: tmp })
  const sample = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#123456' },
  })
    .jpeg()
    .toBuffer()
  await storage.writeBuffer('originals/s.jpg', sample)
})

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

describe('convertImageIfNeeded', () => {
  it('returns null when mime does not need conversion', async () => {
    const result = await convertImageIfNeeded(
      { originalKey: 'originals/s.jpg', mimeType: 'image/jpeg', assetId: 'a' },
      storage,
    )
    expect(result).toBeNull()
  })

  it('preserves the original (does not delete) so a failed retry can re-read it', async () => {
    // sharp sniffs actual bytes, so a JPEG body claiming HEIC still converts.
    const sample = await sharp({
      create: { width: 50, height: 50, channels: 3, background: '#abcdef' },
    })
      .jpeg()
      .toBuffer()
    await storage.writeBuffer('originals/h.heic', sample)

    const result = await convertImageIfNeeded(
      { originalKey: 'originals/h.heic', mimeType: 'image/heic', assetId: 'a' },
      storage,
    )

    expect(result).not.toBeNull()
    expect(result?.newKey).toBe('originals/h.heic.converted.jpg')
    // The original must survive — process-asset deletes it only after the
    // successful DB commit, so retries can re-read it on a mid-pipeline failure.
    const original = await collect(await storage.read('originals/h.heic'))
    expect(original.length).toBeGreaterThan(0)
  })

  it('uses the buffer it is handed instead of re-reading storage, and returns the converted bytes', async () => {
    const sample = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer()
    // Nothing is stored under this key: a read would fail, so success proves the buffer was used.
    const result = await convertImageIfNeeded(
      {
        originalKey: 'originals/not-stored.heic',
        mimeType: 'image/heic',
        assetId: 'a',
        buffer: sample,
      },
      storage,
    )
    expect(result).not.toBeNull()
    const stored = await collect(await storage.read('originals/not-stored.heic.converted.jpg'))
    expect(result?.converted.equals(stored)).toBe(true)
    expect(Number(result?.newSizeBytes)).toBe(stored.length)
    const meta = await sharp(stored).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(40)
  })
})
