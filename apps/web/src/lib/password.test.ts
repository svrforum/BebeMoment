import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password'

describe('password', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await hashPassword('p@ssword123')
    expect(hash).not.toBe('p@ssword123')
    expect(await verifyPassword('p@ssword123', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('hashes are salted (same input → different hash)', async () => {
    const h1 = await hashPassword('same')
    const h2 = await hashPassword('same')
    expect(h1).not.toBe(h2)
  })
})
