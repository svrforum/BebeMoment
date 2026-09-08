import { spawnSync } from 'node:child_process'

/**
 * 시스템 바이너리에 의존하는 테스트용 가드. 이 리포의 CI 는 필요한 도구를 설치하지만
 * 기여자 노트북에는 없을 수 있어, 없으면 실패가 아니라 skip 이 되게 한다. 세 번의 릴리스가
 * 이것 때문에 CI 에서만 깨졌다(ffmpeg 부재, pg_dump major 불일치).
 */
export function hasBinary(...names: string[]): boolean {
  return names.every((n) => spawnSync(n, ['--version'], { stdio: 'ignore' }).status === 0)
}

/** `pg_dump (PostgreSQL) 17.6` 같은 출력에서 major 를 읽는다. 없으면 0. */
export function pgClientMajor(bin = 'pg_dump'): number {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' })
  if (r.status !== 0) return 0
  return Number(/(\d+)/.exec(r.stdout ?? '')?.[1] ?? 0)
}

/** 덤프/복구는 서버 major 이상이어야 한다(pg_dump 는 낮으면 그냥 거절한다). */
export const PG_SERVER_MAJOR = 17
export const hasPgClientForServer = pgClientMajor() >= PG_SERVER_MAJOR
