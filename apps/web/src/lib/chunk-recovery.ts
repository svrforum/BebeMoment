// 배포하면 Next 가 청크 파일 이름을 새로 만든다. 그 순간 앱을 열어둔 사람의 화면은 사라진
// 주소를 계속 부르게 되고, 지연 로드가 조용히 실패한다(업로더가 "초기화 실패"로 죽는 게 그
// 증상이었다). 사용자가 알아서 앱을 껐다 켜야 풀리는 상태라, 한 번만 새로고침해 복구한다.

export const STALE_RELOAD_KEY = 'bebe.staleChunkReloadAt'

/** 같은 배포 안에서 계속 새로고침하지 않도록 두는 간격. */
const RELOAD_COOLDOWN_MS = 60_000

const CHUNK_PATTERNS = [
  /loading chunk .* failed/i,
  /failed to load chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
]

export function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'ChunkLoadError') return true
  return CHUNK_PATTERNS.some((p) => p.test(err.message))
}

/**
 * 마지막 복구 시각(문자열)으로 새로고침 여부를 정한다. 값이 없거나 망가졌거나 오래됐으면 한다.
 * 저장값이 미래면(시계 변경 등) 갇히지 않게 그냥 한다.
 */
export function shouldReload(now: number, lastReloadAt: string | null): boolean {
  if (!lastReloadAt) return true
  const at = Number(lastReloadAt)
  if (!Number.isFinite(at)) return true
  if (at > now) return true
  return now - at > RELOAD_COOLDOWN_MS
}

/** 쿨다운을 지키며 한 번만 새로고침한다. 청크 실패를 직접 잡은 곳에서 부른다. */
export function reloadForStaleChunk(): void {
  let last: string | null = null
  try {
    last = sessionStorage.getItem(STALE_RELOAD_KEY)
  } catch {
    // 저장소를 못 읽으면 쿨다운 없이 한 번 시도한다.
  }
  if (!shouldReload(Date.now(), last)) return
  try {
    sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()))
  } catch {}
  window.location.reload()
}
