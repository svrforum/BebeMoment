import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FfmpegError, ffprobeJson, runFfmpeg } from './ffmpeg'

let work: string
let clip: string

beforeAll(async () => {
  work = await mkdtemp(path.join(tmpdir(), 'bebe-ffmpeg-'))
  clip = path.join(work, 'clip.mp4')
  await runFfmpeg([
    '-f',
    'lavfi',
    '-i',
    'testsrc=duration=1:size=64x64:rate=10',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    clip,
  ])
}, 60_000)

afterAll(async () => {
  await rm(work, { recursive: true, force: true })
})

describe('ffprobeJson', () => {
  it('parses streams and format of a generated clip', async () => {
    const meta = await ffprobeJson(clip)
    const video = meta.streams.find((s) => s.codec_type === 'video')
    expect(video?.codec_name).toBe('h264')
    expect(video?.pix_fmt).toBe('yuv420p')
    expect(video?.width).toBe(64)
    expect(video?.height).toBe(64)
    expect(Number(meta.format.duration)).toBeCloseTo(1, 1)
    expect(Number(meta.format.bit_rate)).toBeGreaterThan(0)
    expect(typeof meta.format.tags).toBe('object')
  })

  it('rejects for a missing file', async () => {
    await expect(ffprobeJson(path.join(work, 'nope.mp4'))).rejects.toBeInstanceOf(FfmpegError)
  })
})

describe('runFfmpeg', () => {
  it('overwrites an existing output (retries re-run into the same path)', async () => {
    await expect(
      runFfmpeg(['-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10', clip]),
    ).resolves.toBeUndefined()
  })

  it('rejects with the captured stderr on a non-zero exit', async () => {
    const err = await runFfmpeg(['-i', path.join(work, 'missing.mp4'), path.join(work, 'x.mp4')])
      .then(() => null)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FfmpegError)
    expect((err as FfmpegError).code).not.toBe(0)
    expect((err as FfmpegError).stderr).toMatch(/missing\.mp4/)
  })
})
