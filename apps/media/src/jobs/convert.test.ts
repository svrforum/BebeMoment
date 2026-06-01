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
})
