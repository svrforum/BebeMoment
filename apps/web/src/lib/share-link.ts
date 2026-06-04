// 링크 공유/복사 3단 폴백. 네이티브 앱(Capacitor) → navigator.share(보안 컨텍스트) →
// 클립보드(execCommand 폴백). ShareLinkButton(asset)·StoryShareButton(스토리) 공용.

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
  if (await webShare(url, title)) return 'shared'
  return (await copyText(url)) ? 'copied' : 'failed'
}
