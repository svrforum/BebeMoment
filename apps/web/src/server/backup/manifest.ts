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

// 백업 id 형식 검증(라우트 입력 가드). makeBackupId 와 동기화 — hex6 suffix 는
// 옛 백업 호환을 위해 선택적. 3개 라우트(download/delete/restore)가 각자 정규식을
// 복제하다 download 만 suffix 패턴 누락으로 모든 다운로드가 깨졌던 회귀를 막기 위해
// 단일 함수로 통일한다.
const BACKUP_ID_RE = /^bebe-backup-\d{8}-\d{6}-(full|incr)(-[0-9a-f]{6})?$/

export function isValidBackupId(id: string): boolean {
  return BACKUP_ID_RE.test(id)
}

export function bundleName(id: string): string {
  return `${id}.tar.zst`
}

export function manifestName(id: string): string {
  return `${id}.manifest.json`
}
