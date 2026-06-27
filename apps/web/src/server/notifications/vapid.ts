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

// 진짜 raw VAPID private 모양: 32바이트 P-256 스칼라 → base64url 무패딩 43자.
const RAW_VAPID_PRIVATE_RE = /^[A-Za-z0-9_-]{43}$/

async function readPrivate(stored: string, secretKey: string, store: Store): Promise<string> {
  try {
    return await decryptSecret(stored, secretKey)
  } catch {
    // decrypt 실패는 두 가지다: (a) 암호화 도입 전 레거시 평문, (b) **다른 SECRET_KEY 로
    // 암호화된 값**(키 회전). (b)를 평문으로 오인해 재암호화하면 구 암호문을 이중래핑해
    // 키를 영구 손상시킨다(공개키와 안 맞는 깨진 private). 그래서 stored 가 실제 raw VAPID
    // private(43자 base64url) 모양일 때만 평문으로 보고 마이그레이션하고, 암호문 모양이면
    // throw — 호출부(워커)가 web-push 를 깔끔히 끄고 관리자에게 재생성/재암호화를 맡긴다.
    // (구키 암호문은 손대지 않으므로 구키만 있으면 여전히 복구 가능.)
    if (RAW_VAPID_PRIVATE_RE.test(stored)) {
      await store.set('push.vapid_private', await encryptSecret(stored, secretKey))
      return stored
    }
    throw new Error('vapid_private cannot be decrypted with the current SECRET_KEY (key rotated?)')
  }
}
