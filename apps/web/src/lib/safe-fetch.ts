import { lookup } from 'node:dns/promises'
import net from 'node:net'

const DEFAULT_TIMEOUT_MS = 8000

// 자기 자신(loopback)·클라우드 메타데이터(169.254.169.254)·IPv6 링크로컬은 정상 IdP 의
// 대상이 될 수 없다 — DNS 리바인딩/메타데이터 SSRF 를 막는다. 사설 LAN(10/172.16/192.168)은
// 내부 IdP(예: 자체 Keycloak)를 쓰는 셀프호스팅을 깨지 않으려 **허용**한다.
// IPv4-mapped IPv6(`::ffff:a.b.c.d`, 또는 URL 파서가 정규화한 hex 형 `::ffff:7f00:1`)에서
// 내장 IPv4 를 꺼낸다 — 매핑 주소로 loopback/metadata 차단을 우회하지 못하게.
function embeddedV4(low: string): string | null {
  if (!low.startsWith('::ffff:')) return null
  const rest = low.slice(7)
  if (rest.includes('.')) return rest
  const m = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!m) return null
  const hi = Number.parseInt(m[1] as string, 16)
  const lo = Number.parseInt(m[2] as string, 16)
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
}

function isBlockedIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return false
  let low = ip.toLowerCase()
  low = embeddedV4(low) ?? low // IPv4-mapped IPv6 는 내장 v4 로 평가
  if (low === '0.0.0.0' || low === '::') return true // unspecified
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
  let addresses: string[]
  if (net.isIP(host) !== 0) {
    addresses = [host]
  } else {
    try {
      // 모든 해석 주소를 검사한다 — 하나라도 차단 대상이면 거부(DNS 리바인딩 완화).
      addresses = (await lookup(host, { all: true })).map((a) => a.address)
    } catch {
      throw new Error('DNS resolution failed for outbound URL')
    }
  }
  if (addresses.length === 0 || addresses.some(isBlockedIp)) {
    throw new Error('Blocked outbound address (loopback/link-local)')
  }
  return url
}

/**
 * assertSafeOutboundUrl + 명시적 타임아웃 + 수동 리다이렉트 재검증. admin 이 설정한 OIDC
 * 엔드포인트 fetch 의 SSRF·행을 막는다. 리다이렉트는 자동 추종(`redirect:'follow'`)하면
 * 첫 hop 만 검증되고 Location 으로 차단 주소에 갈 수 있어, hop 마다 다시 검증한다.
 */
export async function safeFetch(
  raw: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let current = raw
  for (let hop = 0; hop < 5; hop++) {
    await assertSafeOutboundUrl(current)
    const res = await fetch(current, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status < 300 || res.status >= 400) return res
    const loc = res.headers.get('location')
    if (!loc) return res
    current = new URL(loc, current).toString()
  }
  throw new Error('Too many redirects')
}
