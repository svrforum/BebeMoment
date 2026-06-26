import { describe, expect, it } from 'vitest'
import { pickShareBaseUrl } from './share-base-url'

const PUBLIC = 'https://bebe.example.com'

describe('pickShareBaseUrl', () => {
  it('uses PUBLIC_URL when there is no request host', () => {
    expect(pickShareBaseUrl({ host: null, proto: null, publicUrl: PUBLIC })).toBe(PUBLIC)
  })

  it('honors the request host when it matches PUBLIC_URL host', () => {
    expect(pickShareBaseUrl({ host: 'bebe.example.com', proto: 'https', publicUrl: PUBLIC })).toBe(
      'https://bebe.example.com',
    )
  })

  it('falls back to PUBLIC_URL for a spoofed/unlisted host', () => {
    expect(pickShareBaseUrl({ host: 'evil.example.org', proto: 'https', publicUrl: PUBLIC })).toBe(
      PUBLIC,
    )
  })

  it('honors an explicitly allowlisted extra host', () => {
    expect(
      pickShareBaseUrl({
        host: 'share.example.net',
        proto: 'https',
        publicUrl: PUBLIC,
        allowedHosts: ['share.example.net'],
      }),
    ).toBe('https://share.example.net')
  })
})
