// 푸시 전용 경량 서비스워커. serwist 빌드 파이프라인과 무관(Next 15.5 회귀 우회).
// `push`(알림 표시)와 `notificationclick`(deep-link 이동)만 처리한다.

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'bebe-moment'
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
