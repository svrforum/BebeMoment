import { describe, expect, it } from 'vitest'
import { isPublicDomainOrigin } from './public-domain-origin'

describe('isPublicDomainOrigin', () => {
  it('accepts a real reverse-proxy domain', () => {
    expect(isPublicDomainOrigin('https://fam.example.com')).toBe(true)
    expect(isPublicDomainOrigin('https://fam.example.com:8443')).toBe(true)
    expect(isPublicDomainOrigin('http://fam.example.com')).toBe(true)
  })

  it('rejects IPv4 literals (e.g. the LAN PUBLIC_URL or a spoofed Host)', () => {
    expect(isPublicDomainOrigin('http://192.0.2.10:3000')).toBe(false)
    expect(isPublicDomainOrigin('https://198.51.100.7')).toBe(false)
  })

  it('rejects IPv6 literals', () => {
    expect(isPublicDomainOrigin('http://[2001:db8::1]:3000')).toBe(false)
  })

  it('rejects localhost and single-label hosts', () => {
    expect(isPublicDomainOrigin('http://localhost:3000')).toBe(false)
    expect(isPublicDomainOrigin('http://intranet')).toBe(false)
  })

  it('rejects non-http(s) schemes and garbage', () => {
    expect(isPublicDomainOrigin('javascript:alert(1)')).toBe(false)
    expect(isPublicDomainOrigin('ftp://fam.example.com')).toBe(false)
    expect(isPublicDomainOrigin('')).toBe(false)
    expect(isPublicDomainOrigin('not a url')).toBe(false)
  })
})
