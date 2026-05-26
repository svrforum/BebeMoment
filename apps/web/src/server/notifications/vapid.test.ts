import { describe, expect, it } from 'vitest'
import { ensureVapidKeys } from './vapid'

describe('ensureVapidKeys', () => {
  it('키 없으면 생성해 저장하고 반환', async () => {
    const store = new Map<string, string>()
    const get = async (k: string) => store.get(k) ?? null
    const set = async (k: string, v: string) => void store.set(k, v)
    const keys = await ensureVapidKeys({ get, set })
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/)
    expect(keys.privateKey.length).toBeGreaterThan(20)
    const again = await ensureVapidKeys({ get, set })
    expect(again.publicKey).toBe(keys.publicKey) // 멱등
  })
})
