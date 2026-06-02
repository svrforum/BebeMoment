import { setSetting } from '@/server/settings/set'
import type { PrismaClient } from '@bebe/db-public'
import { backupDir, ownerDatabaseUrl, storageDataDir } from './config'
import { type CreateBackupArgs, createBackup } from './create'
import type { BackupManifest, BackupType } from './manifest'
import { loadRemoteConfig, redactSecrets, type RemoteConfig, uploadBackupToRemote } from './remote'

async function gatherSchemaMigrations(prisma: PrismaClient): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at`,
    )
    return rows.map((r) => r.migration_name)
  } catch {
    return []
  }
}

/**
 * 매뉴얼·스케줄 백업의 단일 진입점. 마이그레이션 목록을 모으고, 시크릿 포함 여부에 따라
 * SECRET_KEY 를 넣어 번들을 만든다. (createBackup 은 순수 I/O — 여기서 정책을 조립.)
 */
export async function runBackup(
  args: { type: BackupType; includeSecret: boolean; now: Date },
  prisma: PrismaClient,
): Promise<{ manifest: BackupManifest; bundleBytes: number; remoteMirrored: boolean }> {
  const schemaMigrations = await gatherSchemaMigrations(prisma)
  const createArgs: CreateBackupArgs = {
    type: args.type,
    includeSecret: args.includeSecret,
    backupDir: backupDir(),
    dataDir: storageDataDir(),
    databaseUrl: ownerDatabaseUrl(),
    schemaMigrations,
    secretKey: args.includeSecret ? process.env.SECRET_KEY : undefined,
    now: args.now,
  }
  const { manifest, bundleBytes } = await createBackup(createArgs)

  // 원격 미러(설정 시) — best-effort. 실패해도 로컬 백업은 성공으로 두고 오류만 기록.
  let remoteMirrored = false
  let cfg: RemoteConfig | null = null
  try {
    cfg = await loadRemoteConfig(prisma, process.env.SECRET_KEY ?? '')
    if (cfg) {
      await uploadBackupToRemote({ cfg, backupDir: backupDir(), id: manifest.id })
      remoteMirrored = true
      await setSetting('backup.remote.last_error', null, null, prisma).catch(() => {})
    }
  } catch (e) {
    // 에러 메시지에 섞일 수 있는 자격(accessKeyId·secret·endpoint)을 가린 뒤 저장 — 이
    // 값은 관리자 GET 으로 노출된다.
    const extra = cfg ? [cfg.accessKeyId, cfg.secretAccessKey, cfg.endpoint] : []
    await setSetting(
      'backup.remote.last_error',
      redactSecrets(`${manifest.id}: ${(e as Error).message}`, extra).slice(0, 300),
      null,
      prisma,
    ).catch(() => {})
  }

  return { manifest, bundleBytes, remoteMirrored }
}
