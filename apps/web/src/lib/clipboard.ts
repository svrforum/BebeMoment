/**
 * 텍스트를 클립보드로. Clipboard API 는 보안 컨텍스트(https·localhost)에서만 있어, LAN http
 * 접속과 안드로이드 앱 WebView 에서는 숨은 textarea + execCommand 로 복사한다. 둘 다 안 되면
 * false — 호출자가 사용자에게 실패를 알려야 한다.
 */
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
