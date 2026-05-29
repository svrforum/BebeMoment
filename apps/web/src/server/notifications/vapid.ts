import { decryptSecret, encryptSecret } from '@/lib/crypto'
import webpush from 'web-push'

type Store = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
}
export type VapidKeys = { publicKey: string; privateKey: string }

/**
 * VAPID 키를 보장한다. public 은 평문(클라가 구독에 쓰는 공개키), private 는
 * `SECRET_KEY` 기반 AES-GCM 으로 **암호화 저장**(OIDC 시크릿·FCM 서비스계정과 동일).
 * 과거 평문으로 저장된 private 는 읽을 때 한 번 재암호화해 마이그레이션한다.
 */
export async function ensureVapidKeys(store: Store, secretKey: string): Promise<VapidKeys> {
  const pub = await store.get('push.vapid_public')
  const storedPriv = await store.get('push.vapid_private')
  if (pub && storedPriv) {
    return { publicKey: pub, privateKey: await readPrivate(storedPriv, secretKey, store) }
  }
  const generated = webpush.generateVAPIDKeys()
  await store.set('push.vapid_public', generated.publicKey)
  await store.set('push.vapid_private', await encryptSecret(generated.privateKey, secretKey))
  return generated
}

async function readPrivate(stored: string, secretKey: string, store: Store): Promise<string> {
  try {
    return await decryptSecret(stored, secretKey)
  } catch {
    // 레거시 평문(암호화 도입 전 저장값) — decrypt 실패 시 평문으로 간주하고 한 번
    // 암호화해 다시 저장(마이그레이션). 반환값은 그대로라 web-push 동작은 보존된다.
    await store.set('push.vapid_private', await encryptSecret(stored, secretKey))
    return stored
  }
}
