/**
 * 이미 올라간 영상의 촬영일을 컨테이너 메타데이터로 되돌린다.
 *
 * 영상은 오랫동안 메타데이터를 읽지 않아 촬영일이 파일 수정시각(사실상 업로드 시각)으로
 * 저장됐다. 앞으로 올리는 영상은 process-asset 이 바로잡지만, 기존 것들은 이 스크립트로
 * 한 번 훑어야 한다.
 *
 *   docker exec bebe-app node --import tsx /repo/apps/media/src/scripts/backfill-video-taken-at.ts [--dry-run]
 *
 * 사용자가 직접 고친 촬영일(source=manual)은 건드리지 않는다.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { videoCreatedAt } from '../jobs/video-created-at'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { getStorage } from '../lib/storage'

async function probeCreatedAt(bytes: Buffer): Promise<Date | undefined> {
  const work = await mkdtemp(path.join(tmpdir(), 'bebe-backfill-'))
  const local = path.join(work, 'input')
  try {
    await writeFile(local, bytes)
    const meta = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(local, (err, data) => (err ? reject(err) : resolve(data)))
    })
    return videoCreatedAt(
      meta.format.tags as Record<string, unknown> | undefined,
      process.env.TZ || 'UTC',
    )
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const storage = getStorage()

  const videos = await prisma.asset.findMany({
    where: {
      kind: 'video',
      status: 'ready',
      deletedAt: null,
      takenAtSource: { not: 'manual' },
    },
    select: { id: true, familyId: true, originalKey: true, takenAt: true, originalFilename: true },
    orderBy: { uploadedAt: 'asc' },
  })

  let fixed = 0
  let unchanged = 0
  let noMeta = 0
  let failed = 0

  for (const a of videos) {
    try {
      const chunks: Buffer[] = []
      for await (const c of await storage.read(a.originalKey)) chunks.push(c as Buffer)
      const createdAt = await probeCreatedAt(Buffer.concat(chunks))
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
