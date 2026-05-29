import { decryptSecret } from '@/lib/crypto'
import { describe, expect, it } from 'vitest'
import { ensureVapidKeys } from './vapid'

const SECRET = 'test_secret_key_at_least_32_bytes_long____'

function mapStore() {
  const store = new Map<string, string>()
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string) => void store.set(k, v),
  }
}

describe('ensureVapidKeys', () => {
  it('키 없으면 생성하고 private 는 암호화해 저장(public 은 평문)', async () => {
    const { store, get, set } = mapStore()
    const keys = await ensureVapidKeys({ get, set }, SECRET)
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/)
    expect(keys.privateKey.length).toBeGreaterThan(20)
    const storedPriv = store.get('push.vapid_private')
    expect(storedPriv).toBeTruthy()
    expect(storedPriv).not.toBe(keys.privateKey) // 평문 저장 아님
    expect(await decryptSecret(storedPriv as string, SECRET)).toBe(keys.privateKey)
    expect(store.get('push.vapid_public')).toBe(keys.publicKey) // public 은 평문
  })

  it('멱등 — 두 번째 호출도 같은 키 반환', async () => {
    const { get, set } = mapStore()
    const first = await ensureVapidKeys({ get, set }, SECRET)
    const again = await ensureVapidKeys({ get, set }, SECRET)
    expect(again.publicKey).toBe(first.publicKey)
    expect(again.privateKey).toBe(first.privateKey)
  })

  it('레거시 평문 private 는 읽을 때 암호화로 마이그레이션(동작 보존)', async () => {
    const { store, get, set } = mapStore()
    store.set('push.vapid_public', 'PUBLICKEY')
    store.set('push.vapid_private', 'LEGACY_PLAINTEXT_PRIVATE_VALUE')
    const keys = await ensureVapidKeys({ get, set }, SECRET)
    expect(keys.privateKey).toBe('LEGACY_PLAINTEXT_PRIVATE_VALUE') // 그대로 반환(동작 보존)
    const storedPriv = store.get('push.vapid_private') as string
    expect(storedPriv).not.toBe('LEGACY_PLAINTEXT_PRIVATE_VALUE') // 재암호화됨
    expect(await decryptSecret(storedPriv, SECRET)).toBe('LEGACY_PLAINTEXT_PRIVATE_VALUE')
  })
})
