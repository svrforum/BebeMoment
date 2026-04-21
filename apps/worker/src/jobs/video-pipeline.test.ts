import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { LocalAdapter } from '@bebe/storage'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { processVideo } from './video-pipeline'

const runFfmpeg = promisify(execFile)

let tmp: string
let storage: LocalAdapter
let ffmpegAvailable = true

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'bebe-vid-'))
  storage = new LocalAdapter({ mode: 'local', path: tmp })

  try {
    await runFfmpeg('ffmpeg', ['-version'])
  } catch {
    ffmpegAvailable = false
    return
  }

  const originalPath = path.join(tmp, 'originals', 'sample.mp4')
  await mkdir(path.dirname(originalPath), { recursive: true })
  await runFfmpeg('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=2:size=320x240:rate=24',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    originalPath,
  ])
}, 120_000)

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('processVideo', () => {
  it('generates poster JPEG and preview MP4', async () => {
    if (!ffmpegAvailable) return
    const result = await processVideo(
      { originalKey: 'originals/sample.mp4', assetId: 'asset-v1' },
      storage,
    )
    expect(result.derivatives.poster).toBeTruthy()
    expect(result.derivatives.preview_video).toBeTruthy()
    expect(result.durationMs).toBeGreaterThan(1000)
    expect(result.durationMs).toBeLessThan(3000)
  }, 60_000)
})
