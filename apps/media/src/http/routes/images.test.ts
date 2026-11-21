import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { signImageAccess } from '@/lib/image-access'
import { signFileServeToken } from '@/lib/jwt'
import { buildApp } from '@/server'
import { beforeAll, describe, expect, test } from 'vitest'

const SECRET = 'a'.repeat(40)
const ASSET = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'
const FAMILY = '22222222-2222-4222-8222-222222222222'

describe('GET /media/v1/img/:assetId/:token/:name', () => {
  let storageRoot: string
  const put = (key: string, body: string) => {
    const full = path.join(storageRoot, key)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }

  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
    process.env.STORAGE_MODE = 'local'
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bebe-media-img-'))
    process.env.STORAGE_PATH = storageRoot

    put(`derivatives/${ASSET}/thumb256.webp`, 'webp-bytes')
    put(`derivatives/${ASSET}/display1080.jpeg`, 'jpeg-bytes')
    put(`derivatives/${ASSET}/poster.jpg`, 'poster-bytes')
    // 같은 자산 아래에 있지만 이 주소로는 열리면 안 되는 것들.
    put(`derivatives/${ASSET}/preview.mp4`, 'video-bytes')
    put(`families/${FAMILY}/assets/${ASSET}/original.jpg`, 'original-with-gps')
    put(`derivatives/${OTHER}/thumb256.webp`, 'another-photo')
    put('derivatives/asset/thumb256.webp', 'not-a-uuid-asset')
  })

  const url = (name: string, token = signImageAccess(ASSET), assetId = ASSET) =>
    `/media/v1/img/${assetId}/${token}/${name}`

  async function get(target: string, headers: Record<string, string> = {}) {
    const app = buildApp()
    try {
      return await app.inject({ method: 'GET', url: target, headers })
    } finally {
      await app.close()
    }
  }

  test('serves the derivative with its image type, nosniff and inline', async () => {
    const res = await get(url('thumb256.webp'))
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('webp-bytes')
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers['content-length']).toBe('10')
    expect(res.headers['accept-ranges']).toBe('bytes')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-disposition']).toBe('inline')
  })

  test('one token opens every image derivative of the asset', async () => {
    const token = signImageAccess(ASSET)
    expect((await get(url('thumb256.webp', token))).body).toBe('webp-bytes')
    const display = await get(url('display1080.jpeg', token))
    expect(display.body).toBe('jpeg-bytes')
    expect(display.headers['content-type']).toBe('image/jpeg')
    expect((await get(url('poster.jpg', token))).body).toBe('poster-bytes')
  })

  test('is cached immutably until the token expires', async () => {
    const res = await get(url('thumb256.webp'))
    const m = /^private, max-age=(\d+), immutable$/.exec(res.headers['cache-control'] as string)
    expect(m).not.toBeNull()
    const maxAge = Number(m?.[1])
    expect(maxAge).toBeGreaterThanOrEqual(60 * 60)
    expect(maxAge).toBeLessThanOrEqual(75 * 60)
  })

  test('answers If-None-Match with 304 and a single Range with 206', async () => {
    const target = url('thumb256.webp')
    const first = await get(target)
    const etag = first.headers.etag as string
    expect(etag).toMatch(/^"[0-9a-f]+"$/)
    const cached = await get(target, { 'if-none-match': etag })
    expect(cached.statusCode).toBe(304)
    expect(cached.body).toBe('')
    const part = await get(target, { range: 'bytes=0-3' })
    expect(part.statusCode).toBe(206)
    expect(part.body).toBe('webp')
    expect(part.headers['content-range']).toBe('bytes 0-3/10')
  })

  test('404 when that derivative was never generated', async () => {
    // AVIF 를 끈 인스턴스에서 누가 주소의 형식만 바꿔 본 경우.
    expect((await get(url('thumb256.avif'))).statusCode).toBe(404)
  })

  // 토큰은 테스트가 돌 때 만든다 — 수집 단계에는 아직 비밀이 없다.
  const now = () => Math.floor(Date.now() / 1000)
  test.each([
    ['garbage', () => 'not-a-token'],
    ['a well-formed token with the wrong mac', () => `${now() + 600}.${'A'.repeat(43)}`],
    ['an expired token', () => signImageAccess(ASSET, now() - 3 * 60 * 60)],
    ['a token for another asset', () => signImageAccess(OTHER)],
  ])('401 for %s', async (_label, token) => {
    const res = await get(url('thumb256.webp', token()))
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('webp-bytes')
  })

  test('a file-serve JWT does not open this route', async () => {
    const jwt = await signFileServeToken({
      familyId: FAMILY,
      assetId: ASSET,
      key: `derivatives/${ASSET}/thumb256.webp`,
    })
    expect((await get(url('thumb256.webp', jwt))).statusCode).toBe(401)
  })

  test('an image token does not open the file route', async () => {
    const res = await get(`/media/v1/files/${signImageAccess(ASSET)}`)
    expect(res.statusCode).toBe(401)
  })

  // 이름은 서명에 들어가지 않는다. 유효한 토큰을 가진 사람이 이름만 바꿔 원본·영상·다른
  // 자산으로 넘어가지 못해야 한다 — 파일이 실제로 있어도.
  test.each([
    ['the playable video', 'preview.mp4'],
    ['an upper-case spelling', 'THUMB256.WEBP'],
    [
      'an encoded path to the original',
      `..%2f..%2ffamilies%2f${FAMILY}%2fassets%2f${ASSET}%2foriginal.jpg`,
    ],
    ['an encoded path to another asset', `..%2f${OTHER}%2fthumb256.webp`],
    ['a doubly encoded path', `..%252f${OTHER}%252fthumb256.webp`],
    ['a name with a NUL', 'thumb256.webp%00.jpg'],
  ])('a valid token does not reach %s', async (_label, name) => {
    const res = await get(url(name))
    expect([401, 404]).toContain(res.statusCode)
    expect(res.body).not.toMatch(/video-bytes|original-with-gps|another-photo|webp-bytes/)
  })

  test('an unlisted name is refused as unauthorized, not looked up', async () => {
    expect((await get(url('preview.mp4'))).statusCode).toBe(401)
  })

  test('the asset id must be a UUID even when its token verifies', async () => {
    const res = await get(url('thumb256.webp', signImageAccess('asset'), 'asset'))
    expect(res.statusCode).toBe(401)
    expect(res.body).not.toContain('not-a-uuid-asset')
  })

  test('a path that walks out of the route does not match it', async () => {
    const token = signImageAccess(ASSET)
    const res = await get(`/media/v1/img/${ASSET}/${token}/../../../${OTHER}/thumb256.webp`)
    expect(res.statusCode).not.toBe(200)
    expect(res.body).not.toContain('another-photo')
  })
})
