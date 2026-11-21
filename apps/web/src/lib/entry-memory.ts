/**
 * 히스토리 항목(Navigation API 의 key)마다 값 하나를 기억한다 — 최근에 넣은 `limit` 개만.
 * 화면을 떠났다가 뒤로가기로 **그 항목에** 돌아왔을 때만 되찾으려는 것이라 꺼내면 지운다.
 * 주소가 같아도 다른 항목(탭을 눌러 새로 연 같은 화면)은 받지 못한다.
 */
export type EntryMemory<T> = {
  put: (key: string, value: T) => void
  take: (key: string) => T | undefined
  forget: (key: string) => void
}

export function createEntryMemory<T>(limit: number): EntryMemory<T> {
  // Map 은 넣은 순서를 지킨다 — 다시 넣을 때 지웠다 넣어 가장 최근으로 옮긴다.
  const entries = new Map<string, T>()
  return {
    put(key, value) {
      entries.delete(key)
      entries.set(key, value)
      for (const oldest of entries.keys()) {
        if (entries.size <= limit) break
        entries.delete(oldest)
      }
    },
    take(key) {
      const value = entries.get(key)
      entries.delete(key)
      return value
    },
    forget(key) {
      entries.delete(key)
    },
  }
}
