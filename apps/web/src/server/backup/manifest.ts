export type BackupType = 'full' | 'incr'

export type BackupManifest = {
  version: 1
  id: string
  createdAt: string
  type: BackupType
  /** incr 백업이 누적되는 직전 백업 id. full 이면 null. */
  parentId: string | null
  /** 복구 호환 판단용 — 백업 시점에 적용된 마이그레이션 이름들. */
  schemaMigrations: string[]
  includesSecret: boolean
  dataFileCount: number
  dataBytes: number
}

export function makeBackupId(type: BackupType, now: Date): string {
  // bebe-backup-YYYYMMDD-HHMMSS-<type> (UTC)
  const ts = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  return `bebe-backup-${ts}-${type}`
}

export function bundleName(id: string): string {
  return `${id}.tar.zst`
}

export function manifestName(id: string): string {
  return `${id}.manifest.json`
}
