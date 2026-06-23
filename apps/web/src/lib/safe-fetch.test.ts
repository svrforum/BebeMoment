import { describe, expect, it } from 'vitest'
import { assertSafeOutboundUrl } from './safe-fetch'

describe('assertSafeOutboundUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toThrow()
    await expect(assertSafeOutboundUrl('ftp://example.com/x')).rejects.toThrow()
  })

  it('rejects loopback addresses', async () => {
    await expect(assertSafeOutboundUrl('https://127.0.0.1/.well-known')).rejects.toThrow()
    await expect(assertSafeOutboundUrl('http://[::1]/x')).rejects.toThrow()
  })

  it('rejects link-local / cloud metadata addresses', async () => {
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow()
  })

  it('rejects unspecified and IPv4-mapped-IPv6 loopback addresses', async () => {
    await expect(assertSafeOutboundUrl('http://0.0.0.0/x')).rejects.toThrow()
    await expect(assertSafeOutboundUrl('http://[::]/x')).rejects.toThrow()
    await expect(assertSafeOutboundUrl('http://[::ffff:127.0.0.1]/x')).rejects.toThrow()
    await expect(assertSafeOutboundUrl('http://[::ffff:169.254.169.254]/x')).rejects.toThrow()
  })

  it('allows a public IP literal', async () => {
    await expect(assertSafeOutboundUrl('https://8.8.8.8/')).resolves.toBeInstanceOf(URL)
  })

  it('allows a private-LAN IdP (internal self-hosted)', async () => {
    await expect(assertSafeOutboundUrl('https://10.1.2.3/openid')).resolves.toBeInstanceOf(URL)
  })
})
