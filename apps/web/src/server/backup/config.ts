import { ServiceError } from '@/server/error'
import { envValue } from '@bebe/config'

// 키 하나만 읽는다 — 복구 CLI 는 아직 자리표시자 SECRET_KEY 인 새 기기에서도 돌아야 한다.
export function backupDir(): string {
  return envValue(process.env, 'BACKUP_DIR')
}

/** 백업·복구용 owner 롤 연결 문자열(두 스키마 전부 접근). web/media 분리 롤이 아니다. */
export function ownerDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_WEB
  if (!url) throw new ServiceError(500, 'backup.databaseUrlRequired')
  return url
}

export function storageDataDir(): string {
  return process.env.STORAGE_PATH ?? '/data'
}
