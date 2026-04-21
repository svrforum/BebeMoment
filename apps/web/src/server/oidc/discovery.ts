export type DiscoveryDoc = {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  issuer: string
}

const cache = new Map<string, { expires: number; doc: DiscoveryDoc }>()
const TTL_MS = 60 * 60 * 1000

export async function fetchDiscovery(issuer: string): Promise<DiscoveryDoc> {
  const cached = cache.get(issuer)
  if (cached && cached.expires > Date.now()) return cached.doc
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`)
  const doc = (await res.json()) as DiscoveryDoc
  cache.set(issuer, { expires: Date.now() + TTL_MS, doc })
  return doc
}
