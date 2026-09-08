const DEFAULT_GRACE_MS = 5 * 60 * 1000

/**
 * SIGTERM 뒤 워커가 진행 중인 잡(백업은 분 단위)을 끝낼 때까지 기다리는 상한.
 * `WORKER_SHUTDOWN_GRACE_MS` 로 조정(compose stop_grace_period 와 맞출 것), 기본 5분.
 */
export function shutdownGraceMs(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRACE_MS
}

/**
 * 모든 closer 가 끝나면 'closed', 상한 안에 못 끝나면 'timed-out'. 워커 close() 는 진행 중인 잡이
 * 끝나야 돌아오므로, 상한 없이 기다리면 docker stop 이 SIGKILL 로 끝내고 잡은 반쯤 남는다 —
 * 상한을 넘기면 호출자가 강제 종료로 넘어간다.
 */
export async function closeWithGrace(
  closers: ReadonlyArray<() => Promise<unknown>>,
  graceMs: number,
): Promise<'closed' | 'timed-out'> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'timed-out'>((resolve) => {
    timer = setTimeout(() => resolve('timed-out'), graceMs)
  })
  const all = Promise.all(closers.map((c) => c())).then(() => 'closed' as const)
  try {
    return await Promise.race([all, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
