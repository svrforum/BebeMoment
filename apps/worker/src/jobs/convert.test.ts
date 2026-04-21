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

describe('convertImageIfNeeded', () => {
  it('returns null when mime does not need conversion', async () => {
    const result = await convertImageIfNeeded(
      { originalKey: 'originals/s.jpg', mimeType: 'image/jpeg', assetId: 'a' },
      storage,
    )
    expect(result).toBeNull()
  })
})
