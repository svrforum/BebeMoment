import { beforeAll, describe, expect, test } from 'vitest'
import { buildSignedUrl, imageUrlFor } from './signed-url'

describe('buildSignedUrl', () => {
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = 'a'.repeat(40)
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://example.com'
  })

  test('produces URL under /media/v1/files/', async () => {
    const url = await buildSignedUrl({
      familyId: '11111111-1111-4111-8111-111111111111',
      assetId: '22222222-2222-4222-8222-222222222222',
      key: 'families/fam/assets/asset/original',
    })
    expect(url.startsWith('https://example.com/media/v1/files/')).toBe(true)
    const token = url.slice('https://example.com/media/v1/files/'.length)
    expect(token.length).toBeGreaterThan(20)
  })

  test('returns a relative path when MEDIA_PUBLIC_BASE_URL unset (same-origin)', async () => {
    const save = process.env.MEDIA_PUBLIC_BASE_URL
    process.env.MEDIA_PUBLIC_BASE_URL = ''
    process.env.PUBLIC_URL = 'https://bebe.example'
    const url = await buildSignedUrl({
      familyId: 'f',
      assetId: 'a',
      key: 'k',
    })
    expect(url.startsWith('/media/v1/files/')).toBe(true)
    process.env.MEDIA_PUBLIC_BASE_URL = save
  })

  test('strips trailing slash from base URL', async () => {
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://example.com/'
    const url = await buildSignedUrl({
      familyId: 'f',
      assetId: 'a',
      key: 'k',
    })
    expect(url.startsWith('https://example.com/media/v1/files/')).toBe(true)
    expect(url.includes('com//media')).toBe(false)
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://example.com'
  })
})

describe('imageUrlFor', () => {
  const ID = '22222222-2222-4222-8222-222222222222'
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = 'a'.repeat(40)
  })

  test('is root-relative when MEDIA_PUBLIC_BASE_URL is unset, absolute otherwise', () => {
    const save = process.env.MEDIA_PUBLIC_BASE_URL
    try {
      process.env.MEDIA_PUBLIC_BASE_URL = ''
      expect(imageUrlFor(ID)('thumb256.webp')).toMatch(
        new RegExp(`^/media/v1/img/${ID}/thumb256\\.webp/\\d+\\.[A-Za-z0-9_-]{43}$`),
      )
      process.env.MEDIA_PUBLIC_BASE_URL = 'https://media.example.com/'
      expect(imageUrlFor(ID)('thumb256.webp')).toMatch(
        new RegExp(`^https://media\\.example\\.com/media/v1/img/${ID}/`),
      )
    } finally {
      process.env.MEDIA_PUBLIC_BASE_URL = save
    }
  })

  test('one call signs once — every name shares the token', () => {
    const save = process.env.MEDIA_PUBLIC_BASE_URL
    process.env.MEDIA_PUBLIC_BASE_URL = ''
    const url = imageUrlFor(ID)
    process.env.MEDIA_PUBLIC_BASE_URL = save
    const token = url('thumb256.webp').split('/').pop()
    expect(url('display1080.jpeg')).toBe(`/media/v1/img/${ID}/display1080.jpeg/${token}`)
  })
})
