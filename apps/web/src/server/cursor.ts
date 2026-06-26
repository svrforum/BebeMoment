// 커서 페이지네이션 공통 인코더 — 리스트 서비스마다 동일한 base64url(JSON) 인코딩을
// 중복 정의하던 것을 한 곳으로. 커서 모양(필드)은 서비스마다 달라 제네릭으로 둔다.
export function encodeCursor(c: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}

export function decodeCursor<T extends Record<string, unknown>>(
  s: string,
  isValid: (c: Record<string, unknown>) => c is T,
): T | null {
  try {
    const c = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    if (c && typeof c === 'object' && isValid(c as Record<string, unknown>)) return c as T
  } catch {}
  return null
}
