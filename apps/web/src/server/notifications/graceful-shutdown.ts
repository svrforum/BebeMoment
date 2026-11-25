const DEFAULT_GRACE_MS = 30 * 1000

/**
 * SIGTERM 뒤 워커가 진행 중인 잡을 끝낼 때까지 기다리는 상한. `WORKER_SHUTDOWN_GRACE_MS` 로 조정,
 * 기본 30초. 실제 상한은 docker/run-app.sh 다 — `APP_SHUTDOWN_GRACE_S`(기본 45초)가 지나면 세
 * 프로세스를 SIGKILL 하므로, 이 값은 그보다 강제 종료할 시간만큼 짧아야 한다. 길게 잡아도 그
 * 창을 넘지 못한다: 분 단위로 도는 백업은 컨테이너 stop 에 잘린다.
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
