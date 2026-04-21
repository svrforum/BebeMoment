import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './crypto'

const KEY = 'x'.repeat(64)

describe('crypto', () => {
  it('round-trips a string', async () => {
    const enc = await encryptSecret('my-client-secret', KEY)
    expect(enc).not.toContain('my-client-secret')
    const dec = await decryptSecret(enc, KEY)
    expect(dec).toBe('my-client-secret')
  })
  it('produces different ciphertext each time', async () => {
    const a = await encryptSecret('same', KEY)
    const b = await encryptSecret('same', KEY)
    expect(a).not.toBe(b)
  })
  it('decrypt fails for wrong key', async () => {
    const enc = await encryptSecret('secret', KEY)
    await expect(decryptSecret(enc, 'y'.repeat(64))).rejects.toThrow()
  })
  it('decrypt fails for tampered ciphertext', async () => {
    const enc = await encryptSecret('secret', KEY)
    const tampered = `${enc.slice(0, -4)}XXXX`
    await expect(decryptSecret(tampered, KEY)).rejects.toThrow()
  })
})
