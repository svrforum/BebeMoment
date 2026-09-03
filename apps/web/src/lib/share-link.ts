// 링크 공유/복사 폴백. 네이티브 앱(Capacitor) → 앱 스킴(bebe://share) →
// navigator.share(보안 컨텍스트) → 클립보드(execCommand 폴백).
// ShareSheet(스토리·사진·앨범) 공용.

import { appShareUrl, supportsAppShare } from './app-share'

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean
    Plugins?: {
      Share?: {
        share: (args: {
          title?: string
          text?: string
          url?: string
          dialogTitle?: string
        }) => Promise<unknown>
      }
    }
  }
}

async function nativeShare(url: string, title: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const cap = (window as CapacitorWindow).Capacitor
  const plugin = cap?.Plugins?.Share
  if (!cap?.isNativePlatform?.() || !plugin) return false
  try {
    await plugin.share({ title, url, dialogTitle: title })
  } catch {
    // 사용자가 시트를 닫았거나(취소) 실패 — 네이티브가 처리한 것으로 보고 폴백 안 함.
  }
  return true
}

/**
 * 앱 WebView 전용 경로 — 여기서만 카카오톡 같은 앱으로 **바로** 보낼 수 있다.
 *
 * 앱 안에서는 위아래 단계가 전부 막힌다: 원격 페이지엔 Capacitor 브리지가 없고,
 * 안드로이드 WebView 는 Web Share API 자체가 없으며, http 접속이라 보안 컨텍스트가 아니라
 * navigator.clipboard 도 못 쓴다. 그래서 링크를 복사만 해주고 사용자가 카카오톡을 열어
 * 손으로 붙여넣어야 했다. 앱이 가로채는 커스텀 스킴으로 넘겨 안드로이드 공유 시트를 연다.
 *
 * 스킴을 모르는 구버전 앱(<APP_SHARE_MIN_VERSION)에는 보내지 않는다 — 가로채는 쪽이 없으면
 * 아무 일도 안 일어나 사용자에겐 버튼이 죽은 것으로 보인다.
 */
function appSchemeShare(url: string, title: string): boolean {
  if (typeof window === 'undefined' || !supportsAppShare(navigator.userAgent)) return false
  window.location.href = appShareUrl(url, title)
  return true
}

async function webShare(url: string, title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share || !window.isSecureContext) return false
  try {
    await navigator.share({ title, url })
    return true
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return true
    return false
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export type ShareResult = 'shared' | 'copied' | 'failed'

export async function shareOrCopy(url: string, title: string): Promise<ShareResult> {
  if (await nativeShare(url, title)) return 'shared'
  if (appSchemeShare(url, title)) return 'shared'
  if (await webShare(url, title)) return 'shared'
  return (await copyText(url)) ? 'copied' : 'failed'
}
