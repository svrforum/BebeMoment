import { ServiceError } from '@/server/error'
import type { BackupManifest } from './manifest'

/**
 * target 에서 parentId 를 따라 full 베이스까지 거슬러 올라간 체인(베이스→target 순).
 * 반환 순서가 곧 적용 순서다.
 *
 * 로컬 복구와 원격에서 받아올 목록이 같은 규칙을 써야 한다 — 원격에서 체인 일부만
 * 받아오면 복구가 DB 만 덮어쓴 채 멈춘다.
 */
export function resolveChainFrom(
  manifests: readonly BackupManifest[],
  targetId: string,
): BackupManifest[] {
  const byId = new Map(manifests.map((m) => [m.id, m]))
  const chain: BackupManifest[] = []
  const seen = new Set<string>()
  let id: string | null = targetId
  while (id) {
    if (seen.has(id)) throw new ServiceError(500, `백업 체인 순환: ${id}`)
    seen.add(id)
    const m: BackupManifest | undefined = byId.get(id)
    if (!m) throw new ServiceError(500, `백업을 찾을 수 없어요: ${id}`)
    chain.unshift(m)
    id = m.parentId
  }
  if (chain[0]?.type !== 'full') throw new ServiceError(400, 'backup.chainBaseNotFull')
  return chain
}
