import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { signImageAccess, verifyImageAccess } from './image-access'
import { FILE_SERVE_TTL_SEC, FILE_SERVE_WINDOW_SEC, signFileServeToken } from './jwt'

const SECRET = 'a'.repeat(40)
const ASSET = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'
// 15분 창의 한가운데(창 시작 + 100초).
const WINDOW_START = 1_800_000_000 - (1_800_000_000 % FILE_SERVE_WINDOW_SEC)
const NOW = WINDOW_START + 100

describe('image access token', () => {
  const orig = process.env.MEDIA_JWT_SECRET
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = SECRET
  })
  afterAll(() => {
    process.env.MEDIA_JWT_SECRET = orig
  })

  test('sign + verify roundtrip returns the expiry', () => {
    const token = signImageAccess(ASSET, NOW)
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/)
    expect(verifyImageAccess(ASSET, token, NOW)).toBe(
      WINDOW_START + FILE_SERVE_TTL_SEC + FILE_SERVE_WINDOW_SEC,
    )
  })

  test('the same 15-minute window signs the same token, the next window a different one', () => {
    const a = signImageAccess(ASSET, WINDOW_START)
    const b = signImageAccess(ASSET, WINDOW_START + FILE_SERVE_WINDOW_SEC - 1)
    const c = signImageAccess(ASSET, WINDOW_START + FILE_SERVE_WINDOW_SEC)
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  test('signed in the last second of a window it still lives a full TTL', () => {
    const lastSecond = WINDOW_START + FILE_SERVE_WINDOW_SEC - 1
    const token = signImageAccess(ASSET, lastSecond)
    expect(verifyImageAccess(ASSET, token, lastSecond + FILE_SERVE_TTL_SEC)).not.toBeNull()
  })

  test('expires', () => {
    const token = signImageAccess(ASSET, NOW)
    const exp = WINDOW_START + FILE_SERVE_TTL_SEC + FILE_SERVE_WINDOW_SEC
    expect(verifyImageAccess(ASSET, token, exp - 1)).toBe(exp)
    expect(verifyImageAccess(ASSET, token, exp)).toBeNull()
  })

  test('a token for one asset does not open another', () => {
    expect(verifyImageAccess(OTHER, signImageAccess(ASSET, NOW), NOW)).toBeNull()
  })

  test('a pushed-out expiry does not verify', () => {
    const [exp, mac] = signImageAccess(ASSET, NOW).split('.')
    expect(verifyImageAccess(ASSET, `${Number(exp) + 86_400}.${mac}`, NOW)).toBeNull()
  })

  test.each([
    ['empty', ''],
    ['no dot', '1800004500'],
    ['no expiry', `.${'A'.repeat(43)}`],
    ['non-numeric expiry', `18e8.${'A'.repeat(43)}`],
    ['short mac', `1800004500.${'A'.repeat(42)}`],
    ['long mac', `1800004500.${'A'.repeat(44)}`],
    ['mac with a foreign character', `1800004500.${'A'.repeat(42)}+`],
    ['wrong mac', `${WINDOW_START + FILE_SERVE_TTL_SEC + FILE_SERVE_WINDOW_SEC}.${'A'.repeat(43)}`],
  ])('rejects %s', (_label, token) => {
    expect(verifyImageAccess(ASSET, token, NOW)).toBeNull()
  })

  test('only the canonical spelling of the expiry verifies', () => {
    // 앞에 0 을 붙여도 같은 수로 읽혀 mac 이 맞는다 — 같은 토큰의 다른 철자를 받지 않는다.
    const [exp, mac] = signImageAccess(ASSET, NOW).split('.')
    expect(verifyImageAccess(ASSET, `0${exp}.${mac}`, NOW)).toBeNull()
    expect(verifyImageAccess(ASSET, `00${exp}.${mac}`, NOW)).toBeNull()
  })

  test('the mac is HMAC-SHA256 under a key derived for this purpose, not the raw secret', () => {
    const exp = WINDOW_START + FILE_SERVE_TTL_SEC + FILE_SERVE_WINDOW_SEC
    const input = `${ASSET}\n${exp}`
    const derived = createHmac('sha256', SECRET).update('bebe-media:image-url:v1').digest()
    expect(signImageAccess(ASSET, NOW)).toBe(
      `${exp}.${createHmac('sha256', derived).update(input).digest('base64url')}`,
    )
    // JWT 가 쓰는 비밀 그대로 만든 서명은 통하지 않는다.
    const raw = createHmac('sha256', SECRET).update(input).digest('base64url')
    expect(verifyImageAccess(ASSET, `${exp}.${raw}`, NOW)).toBeNull()
  })

  test('only the canonical spelling of a mac verifies', () => {
    // 43자 base64url 의 마지막 글자는 4비트만 쓴다 — 남는 2비트를 바꾼 글자도 같은 바이트로
    // 풀리지만 같은 토큰으로 치지 않는다.
    const [exp, mac] = signImageAccess(ASSET, NOW).split('.') as [string, string]
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const twin = alphabet[alphabet.indexOf(mac.slice(-1)) ^ 1] as string
    const respelled = `${exp}.${mac.slice(0, -1)}${twin}`
    expect(Buffer.from(mac.slice(0, -1) + twin, 'base64url')).toEqual(Buffer.from(mac, 'base64url'))
    expect(verifyImageAccess(ASSET, respelled, NOW)).toBeNull()
  })

  test('a file-serve JWT is not an image access token', async () => {
    const jwt = await signFileServeToken(
      { familyId: 'fam', assetId: ASSET, key: `derivatives/${ASSET}/thumb256.webp` },
      NOW,
    )
    expect(verifyImageAccess(ASSET, jwt, NOW)).toBeNull()
  })

  test('a different secret does not verify', () => {
    const token = signImageAccess(ASSET, NOW)
    process.env.MEDIA_JWT_SECRET = 'b'.repeat(40)
    try {
      expect(verifyImageAccess(ASSET, token, NOW)).toBeNull()
    } finally {
      process.env.MEDIA_JWT_SECRET = SECRET
    }
  })

  test('refuses to sign with a short secret', () => {
    process.env.MEDIA_JWT_SECRET = 'short'
    try {
      expect(() => signImageAccess(ASSET, NOW)).toThrow(/MEDIA_JWT_SECRET/)
    } finally {
      process.env.MEDIA_JWT_SECRET = SECRET
    }
  })
})
