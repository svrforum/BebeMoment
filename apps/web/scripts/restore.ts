import { backupDir, ownerDatabaseUrl, storageDataDir } from '@/server/backup/config'
import { fetchRemoteChain, listRemoteBackups, remoteConfigFromEnv } from '@/server/backup/remote'
import { restoreBackup } from '@/server/backup/restore'

function usage(): void {
  console.error('사용법: bebe-restore <backup-id>')
  console.error('       bebe-restore --from-remote <backup-id>   원격에서 체인을 받아 복구')
  console.error('       bebe-restore --list-remote               원격 백업 목록')
  console.error(`백업 디렉터리: ${backupDir()}`)
  console.error('')
  console.error('원격 옵션은 DB 없이 env 로 읽습니다(새 기기 복구):')
  console.error('  BACKUP_REMOTE_BUCKET, BACKUP_REMOTE_ACCESS_KEY, BACKUP_REMOTE_SECRET_KEY')
  console.error('  BACKUP_REMOTE_ENDPOINT(S3 호환), BACKUP_REMOTE_REGION, BACKUP_REMOTE_PREFIX')
}

function requireRemoteConfig() {
  const cfg = remoteConfigFromEnv(process.env)
  if (!cfg) {
    console.error('[restore] ❌ 원격 설정이 없어요 — BACKUP_REMOTE_* env 를 설정하세요.')
    usage()
    process.exit(1)
  }
  return cfg
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--list-remote')) {
    const list = await listRemoteBackups(requireRemoteConfig())
    if (list.length === 0) {
      console.log('원격에 백업이 없어요.')
      process.exit(0)
    }
    for (const m of list) {
      const files = `${m.dataFileCount}개 파일`
      const size = `${(m.dataBytes / 1073741824).toFixed(2)}GB`
      console.log(`${m.id}  ${m.type}  ${m.createdAt}  ${files}  ${size}`)
    }
    process.exit(0)
  }

  const fromRemote = args.includes('--from-remote')
  const targetId = args.find((a) => !a.startsWith('--'))
  if (!targetId) {
    usage()
    process.exit(1)
  }

  if (fromRemote) {
    console.log('[restore] 원격에서 체인을 내려받는 중…')
    await fetchRemoteChain({
      cfg: requireRemoteConfig(),
      backupDir: backupDir(),
      targetId,
      log: (m) => console.log(`[restore] ${m}`),
    })
  }

  console.log(`[restore] 시작: ${targetId}`)
  console.log('[restore] ⚠️ 이 작업은 현재 DB·스토리지를 백업 시점으로 덮어씁니다.')

  const result = await restoreBackup({
    targetId,
    backupDir: backupDir(),
    dataDir: storageDataDir(),
    databaseUrl: ownerDatabaseUrl(),
    rolePasswords: {
      web: process.env.BEBE_WEB_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'bebe',
      media: process.env.BEBE_MEDIA_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'bebe',
    },
    log: (m) => console.log(`[restore] ${m}`),
  })

  console.log('[restore] ✅ 복구 완료')
  console.log(`  복구된 백업: ${result.restoredId}`)
  console.log(`  체인: ${result.chain.join(' → ')}`)
  console.log(`  전개된 데이터 파일: ${result.dataFilesExtracted}`)
  if (result.secretKeyPath) {
    console.log('')
    console.log('⚠️ 이 백업에는 SECRET_KEY 가 포함돼 있었어요.')
    console.log(`   추출 위치: ${result.secretKeyPath}`)
    console.log('   이 값을 컨테이너 env SECRET_KEY 로 설정해야 암호화된 설정(OIDC·FCM·푸시)이')
    console.log('   복호화됩니다. 확인 후 이 파일은 안전하게 삭제하세요.')
  }
  process.exit(0)
}

main().catch((e) => {
  console.error('[restore] ❌ 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})
