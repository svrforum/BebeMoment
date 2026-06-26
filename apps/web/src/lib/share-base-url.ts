// 공유 페이지/OG 절대 URL 의 base. 요청 Host(x-forwarded-host)는 클라가 위조할 수 있으므로,
// PUBLIC_URL 의 호스트(또는 SHARE_ALLOWED_HOSTS 로 명시 허용한 호스트)와 일치할 때만
// 신뢰하고, 그 외에는 PUBLIC_URL 로 폴백한다 — 스푸핑된 호스트가 링크·OG 에 박히지 않게.
export function pickShareBaseUrl(args: {
  host: string | null
  proto: string | null
  publicUrl: string | undefined
  allowedHosts?: string[]
}): string {
  const envBase = (args.publicUrl ?? '').replace(/\/$/, '')
  if (!args.host) return envBase
  let publicHost = ''
  try {
    publicHost = new URL(envBase).host
  } catch {}
  const allowed = new Set([publicHost, ...(args.allowedHosts ?? [])].filter(Boolean))
  if (!allowed.has(args.host)) return envBase
  const proto = args.proto ?? (envBase.startsWith('https') ? 'https' : 'http')
  return `${proto}://${args.host}`
}
