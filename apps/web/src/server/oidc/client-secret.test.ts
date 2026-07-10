import { encryptSecret } from '@/lib/crypto'
import { describe, expect, it } from 'vitest'
import { tryDecryptClientSecret } from './client-secret'

describe('tryDecryptClientSecret', () => {
  it('returns the plaintext secret when the key matches', async () => {
    const key = 'k'.repeat(64)
    const enc = await encryptSecret('kakao-rest-secret', key)
    const r = await tryDecryptClientSecret(enc, key)
    expect(r).toEqual({ ok: true, clientSecret: 'kakao-rest-secret' })
  })

  it('returns ok:false instead of throwing when the key does not match (SECRET_KEY rotated)', async () => {
    const enc = await encryptSecret('kakao-rest-secret', 'old-key-'.padEnd(64, 'x'))
    const r = await tryDecryptClientSecret(enc, 'new-key-'.padEnd(64, 'y'))
    expect(r.ok).toBe(false)
  })
})
