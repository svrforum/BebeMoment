const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 경로에서 온 providerId 는 아무 문자열이나 될 수 있는데 컬럼은 UUID 다 — 형식이 다른 값으로
// 조회하면 Prisma 가 던진다. 조회 전에 이걸로 걸러 '없는 공급자' 로 돌려보낸다.
export function isOidcProviderId(id: string): boolean {
  return UUID_RE.test(id)
}
