import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { LocalAdapter } from '@bebe/storage'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runFfmpeg } from '@/lib/ffmpeg'
import { processVideo } from './video-pipeline'

vi.mock('@/lib/ffmpeg', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ffmpeg')>()
  return { ...mod, runFfmpeg: vi.fn(mod.runFfmpeg) }
})

const execFileAsync = promisify(execFile)

let tmp: string
let storage: LocalAdapter
let ffmpegAvailable = true

async function makeClip(file: string, pixFmt: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=2:size=320x240:rate=24',
    '-c:v',
    'libx264',
    '-pix_fmt',
    pixFmt,
    file,
  ])
}

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'bebe-vid-'))
  storage = new LocalAdapter({ mode: 'local', path: tmp })
  process.env.MEDIA_CONCURRENCY_VIDEO = '1'

  try {
    await execFileAsync('ffmpeg', ['-version'])
  } catch {
    ffmpegAvailable = false
    return
  }

  await makeClip(path.join(tmp, 'originals', 'sample.mp4'), 'yuv420p')
  await makeClip(path.join(tmp, 'originals', 'pro.mp4'), 'yuv444p')
}, 120_000)

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true })
})

describe('processVideo', () => {
  it('broadly playable ≤1080p originals get no preview: videoCompat is the original key', async () => {
    if (!ffmpegAvailable) return
    const result = await processVideo(
      { originalKey: 'originals/sample.mp4', assetId: 'asset-v1' },
      storage,
    )
    expect(result.derivatives.v).toBe(2)
    expect(result.derivatives.thumb256.jpeg).toContain('asset-v1')
    expect(result.derivatives.thumb256.webp).toContain('asset-v1')
    expect(result.derivatives.display1080.jpeg).toContain('asset-v1')
    expect(result.derivatives.videoPoster).toBe('derivatives/asset-v1/poster.jpg')
    expect(result.derivatives.videoCompat).toBe('originals/sample.mp4')
    expect(result.derivatives.originalPlayable).toBe(true)
    expect(existsSync(path.join(tmp, 'derivatives/asset-v1/preview.mp4'))).toBe(false)
    expect(existsSync(path.join(tmp, 'derivatives/asset-v1/poster.jpg'))).toBe(true)
    expect(result.blurhash).toBeTruthy()
    expect(result.dominantColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(result.aspectRatio).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThan(1000)
    expect(result.durationMs).toBeLessThan(3000)
  }, 60_000)

  it('originals a phone decoder cannot play get an H.264 yuv420p preview written in place', async () => {
    if (!ffmpegAvailable) return
    const result = await processVideo(
      { originalKey: 'originals/pro.mp4', assetId: 'asset-v2' },
      storage,
    )
    expect(result.derivatives.originalPlayable).toBe(false)
    expect(result.derivatives.videoCompat).toBe('derivatives/asset-v2/preview.mp4')
    expect(existsSync(path.join(tmp, 'derivatives/asset-v2/preview.mp4'))).toBe(true)
    // In local mode ffmpeg reads the original in place and writes to the final key path.
    const calls = vi.mocked(runFfmpeg).mock.calls.map(([args]) => args.join(' '))
    const preview = calls.find((c) => c.includes('derivatives/asset-v2/preview.mp4'))
    expect(preview).toBeDefined()
    expect(preview).toContain(path.join(tmp, 'originals/pro.mp4'))
    expect(preview).toContain('-threads')
    expect(preview).toContain('-r 30')
    expect(preview).toContain('force_divisible_by=2')
    expect(preview).not.toContain('bebe-vid-asset-v2-')
  }, 60_000)

  it('runs at most MEDIA_CONCURRENCY_VIDEO transcodes at once', async () => {
    if (!ffmpegAvailable) return
    let active = 0
    let maxActive = 0
    vi.mocked(runFfmpeg).mockImplementation(async (args) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      try {
        const original = await vi.importActual<typeof import('@/lib/ffmpeg')>('@/lib/ffmpeg')
        return await original.runFfmpeg(args)
      } finally {
        active -= 1
      }
    })
    try {
      await Promise.all([
        processVideo({ originalKey: 'originals/pro.mp4', assetId: 'asset-c1' }, storage),
        processVideo({ originalKey: 'originals/pro.mp4', assetId: 'asset-c2' }, storage),
      ])
    } finally {
      vi.mocked(runFfmpeg).mockReset()
    }
    expect(maxActive).toBe(1)
  }, 120_000)
})
