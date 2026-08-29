'use client'
import { STALE_RELOAD_KEY, isChunkLoadError, shouldReload } from '@/lib/chunk-recovery'
import { useEffect } from 'react'

/**
 * 배포 직후 남아 있는 화면을 한 번만 새로고침해 복구한다.
 *
 * 새 배포는 청크 파일 이름을 바꾸므로, 그 전에 열어둔 화면은 사라진 주소를 부르게 된다.
 * 지연 로드가 그때 실패하는데(업로더가 "초기화 실패"로 죽었다), 사용자는 원인을 알 길이
 * 없고 앱을 껐다 켜야 풀렸다.
 *
 * 새로고침은 마지막 수단이라 **청크 로드 실패에만** 반응하고, 쿨다운을 둬서 진짜로 깨진
 * 배포에서 무한 새로고침에 빠지지 않게 한다.
 */
export function ChunkRecovery() {
  useEffect(() => {
    const recover = (err: unknown) => {
      if (!isChunkLoadError(err)) return
      let last: string | null = null
      try {
        last = sessionStorage.getItem(STALE_RELOAD_KEY)
      } catch {
        // 프라이빗 모드 등 — 저장을 못 읽으면 쿨다운 없이 한 번 시도한다.
      }
      if (!shouldReload(Date.now(), last)) return
      try {
        sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()))
      } catch {}
      window.location.reload()
    }

    const onError = (e: ErrorEvent) => recover(e.error)
    const onRejection = (e: PromiseRejectionEvent) => recover(e.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
