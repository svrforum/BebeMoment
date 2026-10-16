/**
 * 실제 순간으로 저장된 촬영 시각(taken_at)을 벽시계로 되돌린다(jobs/taken-at-backfill.ts).
 *
 * 2026-10 전까지 TZ 가 UTC 가 아닌 컨테이너(compose 기본 Asia/Seoul)에서는 EXIF 사진의 촬영
 * 시각이, 그리고 시간대와 상관없이 파일 수정시각·업로드 시각이 실제 순간으로 저장됐다. KST 에서
 * 9시간 이른 값이라 아침에 찍은 사진이 전날로 묶였다. 고친 코드를 배포한 뒤(마이그레이션
 * 20261016120000_taken_at_wall_clock 이 적용된 뒤) 컨테이너 안에서 한 번 돌린다 — 인스턴스 TZ 로
 * 옮겨야 하기 때문이다. 늘 원래 값에서 다시 계산하므로 다시 돌려도 결과가 같다.
 *
 *   docker exec -w /repo/apps/media bebe-app node --import tsx \
 *     src/scripts/backfill-taken-at-wall-clock.ts [--dry-run]
 *
 * (tsx 는 apps/media 의 의존성이라 루트에서 node --import tsx 로는 안 잡힌다 — run-app.sh 와 같은 방식.)
 */
import { backfillTakenAt } from '../jobs/taken-at-backfill'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { getStorage } from '../lib/storage'

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  // 실제 순간은 이 프로세스의 벽시계로 옮긴다 — 어느 시간대로 옮겼는지 남긴다.
  const timeZone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const report = await backfillTakenAt({ prisma, storage: getStorage(), dryRun, logger })
  logger.info({ ...report, timeZone, dryRun }, 'taken_at backfill done')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'backfill crashed')
    process.exit(1)
  })
