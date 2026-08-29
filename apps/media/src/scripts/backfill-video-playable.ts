/**
 * 기존 영상에 "원본을 그대로 저장해도 폰에서 열리는가" 판정을 채운다.
 *
 * 저장 버튼은 이 판정이 false 일 때만 호환본(preview.mp4)을 내려준다. 판정이 없는 자산은
 * 지금까지처럼 원본이 나가므로, 4:2:2·10비트로 찍힌 예전 영상은 이 스크립트를 한 번
 * 돌리기 전까지 계속 소리만 나는 파일로 저장된다.
 *
 *   docker exec -w /repo bebe-app pnpm --filter @bebe/media exec tsx \
 *     src/scripts/backfill-video-playable.ts [--dry-run]
 *
 * (tsx 는 apps/media 의 의존성이라 루트에서 node --import tsx 로는 안 잡힌다 — run-app.sh 와 같은 방식.)
 *
 * ffprobe 는 파일 헤더만 읽으면 되지만 스토리지 어댑터가 스트림만 주므로 임시 파일로 받는다.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ffmpeg from 'fluent-ffmpeg'
import { parseDerivativesV2 } from '../domain/derivatives-v2'
import { isBroadlyPlayableVideo } from '../domain/video-compat'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { getStorage } from '../lib/storage'

async function probePlayable(bytes: Buffer): Promise<boolean> {
  const work = await mkdtemp(path.join(tmpdir(), 'bebe-playable-'))
  const local = path.join(work, 'input')
  try {
    await writeFile(local, bytes)
    const meta = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(local, (err, data) => (err ? reject(err) : resolve(data)))
    })
    const video = meta.streams.find((s) => s.codec_type === 'video')
    return isBroadlyPlayableVideo(video?.codec_name, video?.pix_fmt)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const storage = getStorage()

  // 가족 전체를 훑는 유지보수 스캔이라 tenant 미들웨어(Asset 은 family 스코프)에 막힌다.
  // 리포 관례대로 전역 조회만 $queryRaw 로 우회하고, 쓰기는 familyId 를 포함해 스코프를 지킨다.
  const videos = await prisma.$queryRaw<
    { id: string; familyId: string; originalKey: string; originalFilename: string }[]
  >`
    SELECT id,
           family_id         AS "familyId",
           original_key      AS "originalKey",
           original_filename AS "originalFilename"
    FROM media.assets
    WHERE kind = 'video'
      AND status = 'ready'
      AND deleted_at IS NULL
      AND derivatives -> 'originalPlayable' IS NULL
    ORDER BY uploaded_at ASC
  `

  let playable = 0
  let needsCompat = 0
  let failed = 0

  for (const a of videos) {
    try {
      const chunks: Buffer[] = []
      for await (const c of await storage.read(a.originalKey)) chunks.push(c as Buffer)
      const ok = await probePlayable(Buffer.concat(chunks))

      // 기존 파생물을 보존한 채 판정만 얹는다.
      const current = await prisma.asset.findFirst({
        where: { id: a.id, familyId: a.familyId },
        select: { derivatives: true },
      })
      const parsed = parseDerivativesV2(current?.derivatives)
      if (!parsed) {
        logger.warn({ assetId: a.id }, 'skipping asset with unreadable derivatives')
        failed += 1
        continue
      }

      logger.info(
        { assetId: a.id, filename: a.originalFilename, originalPlayable: ok },
        dryRun ? 'would record playability' : 'recording playability',
      )
      if (!dryRun) {
        await prisma.asset.update({
          where: { id: a.id, familyId: a.familyId },
          data: { derivatives: { ...parsed, originalPlayable: ok } },
        })
      }
      if (ok) playable += 1
      else needsCompat += 1
    } catch (err) {
      failed += 1
      logger.warn({ assetId: a.id, err }, 'playability backfill failed for asset')
    }
  }

  logger.info(
    { total: videos.length, playable, needsCompat, failed, dryRun },
    'video playability backfill done',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'backfill crashed')
    process.exit(1)
  })
