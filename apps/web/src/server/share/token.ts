import { randomBytes } from 'node:crypto'

export type ShareTtl = 'permanent' | '1d' | '7d' | '30d'

export const SHARE_TTLS: ShareTtl[] = ['permanent', '1d', '7d', '30d']

export function isShareTtl(v: unknown): v is ShareTtl {
  return typeof v === 'string' && (SHARE_TTLS as string[]).includes(v)
}

// 22자 base64url 난수(약 128bit) — 순번처럼 유추 불가. /s/<token> 경로에 그대로.
export function generateShareToken(): string {
  return randomBytes(16).toString('base64url')
}

const DAY_MS = 24 * 60 * 60 * 1000
const TTL_DAYS: Record<Exclude<ShareTtl, 'permanent'>, number> = { '1d': 1, '7d': 7, '30d': 30 }

export function expiryFromTtl(ttl: ShareTtl, now: Date): Date | null {
  if (ttl === 'permanent') return null
  return new Date(now.getTime() + TTL_DAYS[ttl] * DAY_MS)
}
