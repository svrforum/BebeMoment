import { promises as fs } from 'node:fs'
import path from 'node:path'
import { type BackupEntry, listBackups } from './list'
import { bundleName, manifestName } from './manifest'

export async function deleteBackupFiles(dir: string, id: string): Promise<void> {
  await fs.rm(path.join(dir, bundleName(id)), { force: true })
  await fs.rm(path.join(dir, manifestName(id)), { force: true })
}

/**
 * 최신 `keep`개만 남기고 오래된 백업을 지운다. **단 유지되는 incr 백업의 조상(부모 체인)은
 * 절대 지우지 않는다** — full 베이스를 지우면 그 위 증분이 복구 불능이 되기 때문.
 * 지운 id 목록을 반환.
 */
export async function applyRetention(dir: string, keep: number): Promise<string[]> {
  const all: BackupEntry[] = await listBackups(dir) // 최신 → 오래된
  if (keep <= 0 || all.length <= keep) return []

  const byId = new Map(all.map((b) => [b.id, b]))
  const kept = all.slice(0, keep)
  const old = all.slice(keep)

  const preserve = new Set<string>()
  for (const k of kept) {
    let p = k.parentId
    while (p && !preserve.has(p)) {
      preserve.add(p)
      p = byId.get(p)?.parentId ?? null
    }
  }

  const deleted: string[] = []
  for (const o of old) {
    if (preserve.has(o.id)) continue
    await deleteBackupFiles(dir, o.id)
    deleted.push(o.id)
  }
  return deleted
}
