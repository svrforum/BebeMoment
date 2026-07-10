/**
 * True only for a real public reverse-proxy origin: http(s) scheme with a
 * dotted DNS host that is not an IP literal or localhost. Used to gate the
 * instance-global `push.public_base` routing value so a spoofed Host header or
 * the LAN `PUBLIC_URL` can't be stored as the multi-instance routing target.
 */
export function isPublicDomainOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname
    if (!host || host === 'localhost') return false
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false // IPv4 literal
    if (host.includes(':')) return false // IPv6 literal
    if (!host.includes('.')) return false // single-label host
    return true
  } catch {
    return false
  }
}
