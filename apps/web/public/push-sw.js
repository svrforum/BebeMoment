// 경량 서비스워커 — 빌드 파이프라인 없이 그대로 서빙되는 한 파일.
// ① `push`(알림 표시)·`notificationclick`(deep-link 이동)
// ② 사진 파생물 캐시: 한 번 본 썸네일·표시용 사진을 기기에 보관한다.
//
// 앱 셸·페이지·API 는 캐시하지 않는다(오프라인 캐시는 2026-09 에 걷어냈고 되살리지 않았다).
// 파일 이름은 push-sw.js 그대로 둔다 — 푸시 구독이 이 등록(scope '/')에 매여 있다.

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Bebe Moment'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/timeline' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/timeline'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const hit = all.find((c) => c.url.includes(url))
      if (hit) return hit.focus()
      return self.clients.openWindow(url)
    })(),
  )
})

// ─── 사진 캐시 ────────────────────────────────────────────────────────────────
// 서명 URL 은 15분마다 바뀐다(토큰의 iat 가 15분 창으로 양자화된다). 그래서 브라우저 HTTP
// 캐시는 같은 15분 안에서만 맞고, 앱을 다시 열 때마다 모든 썸네일을 새로 받았다.
// 토큰 안의 저장 키(`derivatives/<assetId>/<크기>.<형식>`)는 바뀌지 않고 그 바이트도 바뀌지
// 않으므로, 키로 보관해 두고 먼저 꺼내 준다. 원본·영상·다운로드는 건드리지 않는다.

// 이름을 바꾸면 activate 가 옛 캐시를 지운다. 로그인 화면도 이 접두사로 지운다(lib/photo-cache.ts).
const IMG_CACHE = 'bebe-img-v1'
// 들어온 순서대로 오래된 것부터 버린다. 썸네일 ≈7KB, 표시용 ≈50~150KB.
const IMG_MAX_ENTRIES = 2000
const FILE_PREFIX = '/media/v1/files/'
const IMAGE_KEY = /^derivatives\/[0-9a-f-]{36}\/[a-z0-9]+\.(?:avif|webp|jpe?g)$/

/** 서명 URL 경로 → 이미지 파생물의 저장 키. 그 밖의 것(원본·영상·깨진 토큰)은 null. */
function derivativeKey(pathname) {
  if (!pathname.startsWith(FILE_PREFIX)) return null
  const parts = pathname.slice(FILE_PREFIX.length).split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.key === 'string' && IMAGE_KEY.test(payload.key) ? payload.key : null
  } catch {
    return null
  }
}

let putsSinceTrim = 0
async function trim(cache) {
  putsSinceTrim += 1
  if (putsSinceTrim < 40) return
  putsSinceTrim = 0
  const keys = await cache.keys()
  const extra = keys.length - IMG_MAX_ENTRIES
  for (let i = 0; i < extra; i += 1) await cache.delete(keys[i])
}

async function cachedImage(event, key) {
  const cacheKey = `${self.location.origin}/__img/${key}`
  let cache = null
  try {
    cache = await caches.open(IMG_CACHE)
    const hit = await cache.match(cacheKey)
    if (hit) return hit
  } catch {
    // 캐시를 못 쓰는 환경(용량·사생활 보호 모드)이면 그냥 네트워크로.
    cache = null
  }
  const res = await fetch(event.request)
  // 온전한 같은 출처 응답만 보관한다 — 206(부분)·리다이렉트된 외부 응답(S3)·오류는 넘긴다.
  if (cache && res.status === 200 && res.type === 'basic') {
    const copy = res.clone()
    event.waitUntil(
      cache
        .put(cacheKey, copy)
        .then(() => trim(cache))
        .catch(() => {}),
    )
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.headers.has('range')) return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  const key = derivativeKey(url.pathname)
  if (!key) return
  event.respondWith(cachedImage(event, key))
})

// 새 버전이 대기 없이 바로 넘겨받는다 — 캐시 규칙을 고쳤는데 옛 워커가 계속 도는 일을 막는다.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((n) => n.startsWith('bebe-img-') && n !== IMG_CACHE)
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})
