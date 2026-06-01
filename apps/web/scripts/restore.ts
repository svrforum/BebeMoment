import { backupDir, ownerDatabaseUrl, storageDataDir } from '@/server/backup/config'
import { restoreBackup } from '@/server/backup/restore'

async function main(): Promise<void> {
  const targetId = process.argv[2]
  if (!targetId) {
    console.error('사용법: bebe-restore <backup-id>')
    console.error(
      `백업 디렉터리(${backupDir()})에 <backup-id>.tar.zst + .manifest.json 이 있어야 해요.`,
    )
    process.exit(1)
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
