import { isNewerVersion, parseAppVersion } from './app-release'

/**
 * 안드로이드 앱에서 네이티브 공유 시트(카카오톡 등)를 여는 경로.
 *
 * 앱 WebView 에서는 기존 3단 폴백이 전부 막힌다: 원격 페이지엔 Capacitor 브리지가 없고,
 * WebView 는 Web Share API 를 지원하지 않으며, http 접속이라 보안 컨텍스트가 아니어서
 * navigator.clipboard 도 못 쓴다. 결국 execCommand 복사만 되어, 링크를 카카오톡에 보내려면
 * 손으로 붙여넣어야 했다.
 *
 * 그래서 앱이 가로채는 커스텀 스킴으로 넘긴다(`bebe://open` 딥링크와 같은 방식).
 */
export const APP_SHARE_MIN_VERSION = '1.0.47'

/** 이 앱이 bebe://share 를 처리할 수 있는 버전인지. 구버전엔 보내면 안 된다. */
export function supportsAppShare(userAgent: string): boolean {
  const version = parseAppVersion(userAgent)
  if (!version) return false
  return !isNewerVersion(APP_SHARE_MIN_VERSION, version)
}

export function appShareUrl(url: string, title: string): string {
  const q = `url=${encodeURIComponent(url)}`
  return title ? `bebe://share?${q}&title=${encodeURIComponent(title)}` : `bebe://share?${q}`
}
