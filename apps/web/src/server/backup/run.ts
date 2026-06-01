import type { PrismaClient } from '@bebe/db-public'
import { backupDir, ownerDatabaseUrl, storageDataDir } from './config'
import { type CreateBackupArgs, createBackup } from './create'
import type { BackupManifest, BackupType } from './manifest'

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
): Promise<{ manifest: BackupManifest; bundleBytes: number }> {
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
  return { manifest, bundleBytes }
}
