import { randomBytes } from 'node:crypto'

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
  /** 파생물(썸네일) 포함 여부. false 면 복구 후 재생성 필요(원본은 있음). 옛 백업엔 없을 수 있음. */
  includesDerivatives?: boolean
  dataFileCount: number
  dataBytes: number
}

export function makeBackupId(type: BackupType, now: Date): string {
  // bebe-backup-YYYYMMDD-HHMMSS-<type>-<hex6> (UTC). 초 단위 타임스탬프라 같은 초에
  // 두 백업(수동+스케줄 등)이 만들어지면 id 가 충돌해 번들을 덮어쓰던 문제 → 랜덤
  // suffix 로 충돌 방지.
  const ts = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const suffix = randomBytes(3).toString('hex')
  return `bebe-backup-${ts}-${type}-${suffix}`
}

export function bundleName(id: string): string {
  return `${id}.tar.zst`
}

export function manifestName(id: string): string {
  return `${id}.manifest.json`
}
