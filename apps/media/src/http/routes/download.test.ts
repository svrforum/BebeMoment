import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type SignDownloadArgs, signDownloadToken } from '@/lib/jwt'
import { buildApp } from '@/server'
import { LIVE_SLOTS } from './download'
import sharp from 'sharp'
import { beforeAll, describe, expect, test } from 'vitest'

const FAMILY = 'fam'
const ASSET = 'asset'
const OTHER_ASSET = 'other'
const ORIGINAL_KEY = `families/${FAMILY}/assets/${ASSET}/original`
const BIG_KEY = `families/${FAMILY}/assets/big/original`
const COMPAT_KEY = `derivatives/${ASSET}/preview.mp4`
const COMPAT_BYTES = 'compat-mp4-bytes'

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

// 제거된 압축 품질로 발급된 토큰(배포 직전 10분 창) — 타입에는 더 이상 없어 캐스팅해 흉내 낸다.
async function legacyToken(
  quality: 'hd' | 'sd',
  overrides: Partial<SignDownloadArgs> = {},
): Promise<string> {
  return tokenFor({ ...overrides, quality } as unknown as Partial<SignDownloadArgs>)
}

function write(root: string, key: string, bytes: Buffer | string): void {
  const full = path.join(root, key)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, bytes)
}

describe('GET /media/v1/download/:signed', () => {
  let storageRoot: string
  let originalBytes: Buffer

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
    write(storageRoot, ORIGINAL_KEY, originalBytes)
    write(storageRoot, COMPAT_KEY, COMPAT_BYTES)
    write(storageRoot, `families/${FAMILY}/assets/${OTHER_ASSET}/original`, 'other-family-bytes')

    // 노이즈 사진 — 재인코딩이 한 번에 끝나지 않아야 동시성 슬롯을 검사할 수 있다.
    const noise = await sharp(randomBytes(2400 * 1600 * 3), {
      raw: { width: 2400, height: 1600, channels: 3 },
    })
      .jpeg({ quality: 92 })
      .toBuffer()
    write(storageRoot, BIG_KEY, noise)
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

  test('compat streams the stored derivative — the derivatives/ key shape is accepted', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor({
        kind: 'video',
        quality: 'compat',
        videoCompatKey: COMPAT_KEY,
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
      })}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('video/mp4')
    expect(res.body).toBe(COMPAT_BYTES)
    await app.close()
  })

  test('a compat derivative that vanished is a 404, not a live transcode', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor({
        kind: 'video',
        quality: 'compat',
        videoCompatKey: `derivatives/${ASSET}/gone.mp4`,
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
      })}`,
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  test('a legacy hd photo request still saves — it falls back to the gallery variant', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await legacyToken('hd')}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/jpeg')
    const meta = await sharp(res.rawPayload).metadata()
    expect(meta.exif).toBeUndefined()
    await app.close()
  })

  test('a legacy sd video request still saves — it falls back to the stored original', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await legacyToken('sd', {
        kind: 'video',
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
      })}`,
    })
    expect(res.statusCode).toBe(200)
    expect(sha256(res.rawPayload)).toBe(sha256(originalBytes))
    await app.close()
  })

  test('a token cannot fetch another asset original — families/ key shape', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor({
        originalKey: `families/${FAMILY}/assets/${OTHER_ASSET}/original`,
      })}`,
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('a token cannot fetch another asset derivative — derivatives/ key shape', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/media/v1/download/${await tokenFor({
        kind: 'video',
        quality: 'compat',
        videoCompatKey: `derivatives/${OTHER_ASSET}/preview.mp4`,
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
      })}`,
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('a gallery re-encode is refused with a retriable 503 while both slots are taken', async () => {
    const app = buildApp()
    const token = await tokenFor({ assetId: 'big', originalKey: BIG_KEY, quality: 'gallery' })
    const url = `/media/v1/download/${token}`

    // 슬롯을 직접 채운다 — 실제 재인코드를 경주시키면 결과가 기계 속도에 좌우된다.
    const held = [LIVE_SLOTS.tryAcquire(), LIVE_SLOTS.tryAcquire()]
    expect(held.every(Boolean)).toBe(true)
    try {
      const refused = await app.inject({ method: 'GET', url })
      expect(refused.statusCode).toBe(503)
      expect(JSON.parse(refused.body).error.retriable).toBe(true)
    } finally {
      for (const release of held) release?.()
    }

    const after = await app.inject({ method: 'GET', url })
    expect(after.statusCode).toBe(200)
    await app.close()
  })
})
