/**
 * 서비스워커(public/push-sw.js)가 기기에 보관하는 사진 캐시. 이름은 워커의 `IMG_CACHE` 와
 * 같은 접두사여야 한다(push-sw.test.ts 가 맞춰 본다).
 */
export const PHOTO_CACHE_PREFIX = 'bebe-img-'

/** 앱 셸이 뜰 때 한 번 — 푸시를 켜지 않은 사용자도 사진 캐시는 쓰도록 워커를 등록한다. */
export function registerPhotoWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // 등록 실패(사생활 보호 모드·http 접속 등)는 캐시 없이 예전처럼 도는 것뿐이라 알리지 않는다.
  navigator.serviceWorker.register('/push-sw.js').catch(() => {})
}

/** 로그아웃된 기기에 가족 사진이 남지 않게 보관분을 지운다. */
export async function clearPhotoCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const names = await caches.keys()
    await Promise.all(
      names.filter((n) => n.startsWith(PHOTO_CACHE_PREFIX)).map((n) => caches.delete(n)),
    )
  } catch {
    // Cache Storage 를 못 쓰는 환경이면 지울 것도 없다.
  }
}
