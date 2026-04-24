import { beforeAll, describe, expect, test } from 'vitest'
import { buildSignedUrl } from './signed-url'

describe('buildSignedUrl', () => {
  beforeAll(() => {
    process.env.MEDIA_JWT_SECRET = 'a'.repeat(40)
    process.env.MEDIA_PUBLIC_BASE_URL = 'https://example.com'
  })

  test('produces URL under /media/v1/files/', async () => {
    const url = await buildSignedUrl({
      familyId: '11111111-1111-1111-1111-111111111111',
      assetId: '22222222-2222-2222-2222-222222222222',
      key: 'families/fam/assets/asset/original',
    })
    expect(url.startsWith('https://example.com/media/v1/files/')).toBe(true)
    const token = url.slice('https://example.com/media/v1/files/'.length)
    expect(token.length).toBeGreaterThan(20)
  })

  test('falls back to PUBLIC_URL when MEDIA_PUBLIC_BASE_URL unset', async () => {
    const save = process.env.MEDIA_PUBLIC_BASE_URL
    process.env.MEDIA_PUBLIC_BASE_URL = ''
    process.env.PUBLIC_URL = 'https://bebe.example'
    const url = await buildSignedUrl({
      familyId: 'f',
      assetId: 'a',
      key: 'k',
    })
    expect(url.startsWith('https://bebe.example/media/v1/files/')).toBe(true)
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
