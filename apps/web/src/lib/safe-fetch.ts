import { lookup } from 'node:dns/promises'
import net from 'node:net'

const DEFAULT_TIMEOUT_MS = 8000

// 자기 자신(loopback)·클라우드 메타데이터(169.254.169.254)·IPv6 링크로컬은 정상 IdP 의
// 대상이 될 수 없다 — DNS 리바인딩/메타데이터 SSRF 를 막는다. 사설 LAN(10/172.16/192.168)은
// 내부 IdP(예: 자체 Keycloak)를 쓰는 셀프호스팅을 깨지 않으려 **허용**한다.
function isBlockedIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return false
  const low = ip.toLowerCase()
  if (low === '::1' || low.startsWith('127.')) return true // loopback
  if (low.startsWith('169.254.') || low.startsWith('fe80:')) return true // link-local + metadata
  return false
}

/**
 * 외부로 나가는 URL 이 안전한지 검증. http/https 만 허용하고, 호스트를 DNS 로 해석해
 * loopback/link-local 이면 거부한다(SSRF 방어). dev/내부망 예외가 필요하면
 * OIDC_ALLOW_LOCAL_FETCH=true 로 푼다.
 */
export async function assertSafeOutboundUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Invalid outbound URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Blocked outbound scheme: ${url.protocol}`)
  }
  if (process.env.OIDC_ALLOW_LOCAL_FETCH === 'true') return url

  const host = url.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  let ip = host
  if (net.isIP(host) === 0) {
    try {
      ip = (await lookup(host)).address
    } catch {
      throw new Error('DNS resolution failed for outbound URL')
    }
  }
  if (isBlockedIp(ip)) throw new Error('Blocked outbound address (loopback/link-local)')
  return url
}

/** assertSafeOutboundUrl + 명시적 타임아웃. admin 이 설정한 OIDC 엔드포인트 fetch 의 SSRF·행 방지. */
export async function safeFetch(
  raw: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  await assertSafeOutboundUrl(raw)
  return fetch(raw, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}
