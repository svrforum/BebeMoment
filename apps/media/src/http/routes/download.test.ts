import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { type SignDownloadArgs, signDownloadToken } from '@/lib/jwt'
import { buildApp } from '@/server'
import sharp from 'sharp'
import { beforeAll, describe, expect, test } from 'vitest'

const execFileAsync = promisify(execFile)

const FAMILY = 'fam'
const ASSET = 'asset'
const ORIGINAL_KEY = `families/${FAMILY}/assets/${ASSET}/original`

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

async function tokenFor(overrides: Partial<SignDownloadArgs>): Promise<string> {
  return signDownloadToken({
    familyId: FAMILY,
    assetId: ASSET,
    originalKey: ORIGINAL_KEY,
    kind: 'image',
    quality: 'original',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    ...overrides,
  })
}

describe('GET /media/v1/download/:signed', () => {
  let storageRoot: string
  let originalBytes: Buffer
  let ffmpegAvailable = true

  beforeAll(async () => {
    process.env.MEDIA_JWT_SECRET = 'a'.repeat(40)
    process.env.STORAGE_MODE = 'local'
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-media-download-'))
    process.env.STORAGE_PATH = storageRoot

    // 1600x900 pixels tagged Orientation 6 with a camera EXIF block: the file a phone produces.
    originalBytes = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 90, g: 40, b: 160 } },
    })
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'bebe', Model: 'cam' } } })
      .jpeg({ quality: 90 })
      .toBuffer()
    const full = path.join(storageRoot, ORIGINAL_KEY)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, originalBytes)

    try {
      await execFileAsync('ffmpeg', ['-version'])
      const clip = path.join(storageRoot, `families/${FAMILY}/assets/clip/original`)
      fs.mkdirSync(path.dirname(clip), { recursive: true })
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=6:size=1280x720:rate=30',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-f',
        'mp4',
        clip,
      ])
    } catch {
      ffmpegAvailable = false
    }
  }, 120_000)

  test('original streams the stored bytes untouched with the real content-type', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor({ quality: 'original' })}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    expect(res.headers['content-length']).toBe(String(originalBytes.length))
    expect(res.headers['content-disposition']).toContain('photo.jpg')
    expect(sha256(res.rawPayload)).toBe(sha256(originalBytes))
    await app.close()
  })

  test('gallery re-encodes the JPEG with orientation baked in and EXIF dropped', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor({ quality: 'gallery' })}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    const meta = await sharp(res.rawPayload).metadata()
    expect(meta.width).toBe(900)
    expect(meta.height).toBe(1600)
    expect(meta.orientation).toBeUndefined()
    expect(meta.exif).toBeUndefined()
    await app.close()
  })

  test('a third concurrent live transcode is refused with a retriable 503', async () => {
    if (!ffmpegAvailable) return
    const app = buildApp()
    const token = await tokenFor({
      assetId: 'clip',
      originalKey: `families/${FAMILY}/assets/clip/original`,
      kind: 'video',
      quality: 'hd',
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
    })
    const url = `/media/v1/download/${token}`
    const results = await Promise.all([
      app.inject({ method: 'GET', url }),
      app.inject({ method: 'GET', url }),
      app.inject({ method: 'GET', url }),
    ])
    const codes = results.map((r) => r.statusCode).sort()
    expect(codes).toEqual([200, 200, 503])
    const refused = results.find((r) => r.statusCode === 503)
    expect(JSON.parse(refused?.body ?? '{}').error.retriable).toBe(true)
    await app.close()
  }, 60_000)
})
