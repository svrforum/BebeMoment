// 네이티브 앱(Capacitor)에서 홈 위젯이 쓸 토큰을 발급받아 네이티브에 전달한다.
// push-client 와 동일하게 window.Capacitor 글로벌 브리지를 통해 접근 — apps/web 은
// Capacitor 의존성을 갖지 않는다.

type WidgetBridge = {
  isNativePlatform?: () => boolean
  Plugins?: {
    BebeWidget?: { setConfig: (cfg: { token: string; serverUrl: string }) => Promise<unknown> }
  }
}

function capacitor(): WidgetBridge | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { Capacitor?: WidgetBridge }).Capacitor ?? null
}

/**
 * 위젯 토큰을 발급(`POST /api/widget/token`)받아 네이티브 플러그인에 저장시킨다.
 * 네이티브 앱이 아니거나 플러그인이 없으면 무동작(웹/구버전 앱 안전). 앱 로드 시 1회 호출.
 */
export async function registerWidget(): Promise<boolean> {
  const cap = capacitor()
  const plugin = cap?.Plugins?.BebeWidget
  if (!cap?.isNativePlatform?.() || !plugin) return false
  try {
    const res = await fetch('/api/widget/token', { method: 'POST' })
    if (!res.ok) return false
    const { token } = (await res.json()) as { token?: string }
    if (!token) return false
    await plugin.setConfig({ token, serverUrl: window.location.origin })
    return true
  } catch {
    return false
  }
}
