export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

export async function registerPushSW(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/push-sw.js')
}

export async function subscribeToPush(): Promise<boolean> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await registerPushSW()
  const res = await fetch('/api/notifications/vapid-public')
  if (!res.ok) throw new Error('VAPID 공개키를 가져오지 못했어요')
  const { publicKey } = (await res.json()) as { publicKey: string }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  const json = subscription.toJSON()
  const keys = json.keys ?? {}
  const save = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    }),
  })
  if (!save.ok) throw new Error('알림 구독 저장에 실패했어요')
  return true
}

export async function unsubscribeFromPush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await fetch('/api/notifications/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  })
  await subscription.unsubscribe()
}

export async function currentPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js')
  const subscription = await registration?.pushManager.getSubscription()
  return Boolean(subscription)
}

// --- Native (Capacitor / Android app) push ---
// The Capacitor runtime injects window.Capacitor into the WebView, including on
// the remote server page. We access the bridge globally so apps/web carries no
// Capacitor dependency.
type CapacitorBridge = {
  isNativePlatform?: () => boolean
  Plugins?: {
    BebePush?: { initAndGetToken: (cfg: Record<string, string>) => Promise<{ token: string }> }
  }
}

function capacitor(): CapacitorBridge | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor ?? null
}

export function isNativeApp(): boolean {
  if (capacitor()?.isNativePlatform?.() === true) return true
  // 원격 페이지엔 window.Capacitor 가 없어 브리지로 못 잡으므로 User-Agent 표식으로도
  // 감지(Android 앱이 UA 에 "bebeApp" 추가, MainActivity.markUserAgent).
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('bebeApp')) return true
  return false
}

export async function registerNativePush(): Promise<boolean> {
  const cap = capacitor()
  const plugin = cap?.Plugins?.BebePush
  if (!cap?.isNativePlatform?.() || !plugin) return false

  const cfgRes = await fetch('/api/push/fcm-config')
  if (!cfgRes.ok) return false
  const cfg = (await cfgRes.json()) as {
    configured: boolean
    apiKey?: string
    appId?: string
    projectId?: string
    messagingSenderId?: string
  }
  if (!cfg.configured || !cfg.apiKey || !cfg.appId || !cfg.projectId || !cfg.messagingSenderId) {
    return false
  }

  const { token } = await plugin.initAndGetToken({
    apiKey: cfg.apiKey,
    appId: cfg.appId,
    projectId: cfg.projectId,
    messagingSenderId: cfg.messagingSenderId,
  })
  const save = await fetch('/api/notifications/register-device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: 'android' }),
  })
  return save.ok
}
