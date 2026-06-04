import { ServiceError } from '@/server/error'

export function backupDir(): string {
  return process.env.BACKUP_DIR ?? '/backups'
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
