import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { describe, expect, it } from 'vitest'
import { ensureVapidKeys } from './vapid'

const SECRET = 'test_secret_key_at_least_32_bytes_long____'
// 진짜 raw VAPID private 모양(32바이트 → base64url 43자). 레거시 평문 마이그레이션은
// 이런 키-모양일 때만 일어나야 한다(암호문 모양은 회전된 값일 수 있어 손상 위험).
const LEGACY_PLAINTEXT_KEY = Buffer.alloc(32, 7).toString('base64url')

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

  it('레거시 평문 private(키-모양) 는 읽을 때 암호화로 마이그레이션(동작 보존)', async () => {
    const { store, get, set } = mapStore()
    store.set('push.vapid_public', 'PUBLICKEY')
    store.set('push.vapid_private', LEGACY_PLAINTEXT_KEY)
    const keys = await ensureVapidKeys({ get, set }, SECRET)
    expect(keys.privateKey).toBe(LEGACY_PLAINTEXT_KEY) // 그대로 반환(동작 보존)
    const storedPriv = store.get('push.vapid_private') as string
    expect(storedPriv).not.toBe(LEGACY_PLAINTEXT_KEY) // 재암호화됨
    expect(await decryptSecret(storedPriv, SECRET)).toBe(LEGACY_PLAINTEXT_KEY)
  })

  it('SECRET_KEY 회전: 다른 키로 암호화된 private 는 재래핑하지 않고 throw(이중래핑 손상 방지)', async () => {
    const { store, get, set } = mapStore()
    const OLD_SECRET = 'old_secret_key_at_least_32_bytes_long__AA'
    const NEW_SECRET = 'new_secret_key_at_least_32_bytes_long__BB'
    store.set('push.vapid_public', 'PUBLICKEY')
    const cipherUnderOld = await encryptSecret(LEGACY_PLAINTEXT_KEY, OLD_SECRET)
    store.set('push.vapid_private', cipherUnderOld)
    // 구키 암호문을 신키로 읽으면 복호화 실패 — 평문으로 오인해 재암호화하면 손상된다.
    await expect(ensureVapidKeys({ get, set }, NEW_SECRET)).rejects.toThrow()
    // 저장값은 원래 암호문 그대로(이중래핑 X) — 구키만 있으면 여전히 복구 가능해야 한다.
    expect(store.get('push.vapid_private')).toBe(cipherUnderOld)
    expect(await decryptSecret(cipherUnderOld, OLD_SECRET)).toBe(LEGACY_PLAINTEXT_KEY)
  })
})
