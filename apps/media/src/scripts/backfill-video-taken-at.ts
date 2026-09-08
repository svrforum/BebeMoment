/**
 * 이미 올라간 영상의 촬영일을 컨테이너 메타데이터로 되돌린다.
 *
 * 영상은 오랫동안 메타데이터를 읽지 않아 촬영일이 파일 수정시각(사실상 업로드 시각)으로
 * 저장됐다. 앞으로 올리는 영상은 process-asset 이 바로잡지만, 기존 것들은 이 스크립트로
 * 한 번 훑어야 한다.
 *
 *   docker exec -w /repo/apps/media bebe-app node --import tsx \
 *     src/scripts/backfill-video-taken-at.ts [--dry-run]
 *
 * (tsx 는 apps/media 의 의존성이라 루트에서 node --import tsx 로는 안 잡힌다 — run-app.sh 와 같은 방식.)
 *
 * 사용자가 직접 고친 촬영일(source=manual)은 건드리지 않는다.
 */
import type { StorageAdapter } from '@bebe/storage'
import { videoCreatedAt } from '../jobs/video-created-at'
import { ffprobeJson } from '../lib/ffmpeg'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { getStorage, withLocalFile } from '../lib/storage'

async function probeCreatedAt(storage: StorageAdapter, key: string): Promise<Date | undefined> {
  const meta = await withLocalFile(storage, key, ffprobeJson)
  return videoCreatedAt(meta.format.tags, process.env.TZ || 'UTC')
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const storage = getStorage()

  // 가족 전체를 훑는 유지보수 스캔이라 tenant 미들웨어(Asset 은 family 스코프)에 막힌다.
  // 리포 관례대로 전역 조회만 $queryRaw 로 우회하고, 쓰기는 familyId 를 포함해 스코프를 지킨다.
  const videos = await prisma.$queryRaw<
    {
      id: string
      familyId: string
      originalKey: string
      takenAt: Date
      originalFilename: string
    }[]
  >`
    SELECT id,
           family_id         AS "familyId",
           original_key      AS "originalKey",
           taken_at          AS "takenAt",
           original_filename AS "originalFilename"
    FROM media.assets
    WHERE kind = 'video'
      AND status = 'ready'
      AND deleted_at IS NULL
      AND taken_at_source <> 'manual'
    ORDER BY uploaded_at ASC
  `

  let fixed = 0
  let unchanged = 0
  let noMeta = 0
  let failed = 0

  for (const a of videos) {
    try {
      const createdAt = await probeCreatedAt(storage, a.originalKey)
      if (!createdAt) {
        noMeta += 1
        continue
      }
      if (createdAt.getTime() === a.takenAt.getTime()) {
        unchanged += 1
        continue
      }
      logger.info(
        {
          assetId: a.id,
          filename: a.originalFilename,
          from: a.takenAt.toISOString(),
          to: createdAt.toISOString(),
        },
        dryRun ? 'would fix taken_at' : 'fixing taken_at',
      )
      if (!dryRun) {
        await prisma.asset.update({
          where: { id: a.id, familyId: a.familyId },
          data: { takenAt: createdAt, takenAtSource: 'exif' },
        })
      }
      fixed += 1
    } catch (err) {
      failed += 1
      logger.warn({ assetId: a.id, err }, 'backfill failed for asset')
    }
  }

  logger.info(
    { total: videos.length, fixed, unchanged, noMeta, failed, dryRun },
    'video taken_at backfill done',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'backfill crashed')
    process.exit(1)
  })
