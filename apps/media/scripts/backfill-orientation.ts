/**
 * EXIF Orientation 백필 — 회전 사진(Orientation 5-8)의 width/height/aspectRatioCached 와
 * blurhash 를 교정한다. 과거 image-pipeline 이 raw(회전 전) 치수와 비회전 blurhash 를
 * 저장한 자산이 대상(2026-06 수정 이전 업로드). 파생물 9종은 항상 .rotate() 였으므로
 * 재생성 불필요 — 메타데이터/blurhash 만 다시 계산해 갱신한다.
 *
 * 멱등: Orientation 1(또는 EXIF 없음) 자산은 autoOrient 치수·rotate 무영향 blurhash 가
 * 기존값과 같아 갱신 대상에서 빠진다. 회전 자산만 변경된다.
 *
 * 기본은 **dry-run**(변경 후보만 집계·샘플 출력). 실제 반영은 `--apply`.
 *
 * 실행(컨테이너 내):
 *   docker cp apps/media/scripts/backfill-orientation.ts bebe-app:/tmp/bf.ts
 *   docker exec bebe-app sh -c 'cd /repo && pnpm --filter @bebe/media exec tsx /tmp/bf.ts'          # dry-run
 *   docker exec bebe-app sh -c 'cd /repo && pnpm --filter @bebe/media exec tsx /tmp/bf.ts --apply'  # 반영
 */
import { computeBlurhash } from '@/domain/blurhash'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getStorage } from '@/lib/storage'
import sharp from 'sharp'

type Row = {
  id: string
  family_id: string
  original_key: string
  width: number | null
  height: number | null
  aspect_ratio_cached: number | null
  blurhash: string | null
}

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const c of stream) chunks.push(c as Buffer)
  return Buffer.concat(chunks)
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const storage = getStorage()

  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, family_id, original_key, width, height, aspect_ratio_cached, blurhash
    FROM media.assets
    WHERE kind = 'image' AND status = 'ready' AND deleted_at IS NULL
  `
  logger.info({ total: rows.length, apply }, 'orientation backfill: scanning ready images')

  let scanned = 0
  let changed = 0
  let updated = 0
  let failed = 0
  const samples: string[] = []

  for (const r of rows) {
    scanned += 1
    try {
      const buf = await collect(await storage.read(r.original_key))
      const meta = await sharp(buf, { failOn: 'none' }).metadata()
      const w = meta.autoOrient?.width ?? meta.width ?? null
      const h = meta.autoOrient?.height ?? meta.height ?? null
      const ar = w && h && w > 0 && h > 0 ? Number((w / h).toFixed(4)) : null
      const bh = await computeBlurhash(buf)

      // 치수 전치(가로↔세로) 또는 blurhash 가 달라진 경우만 갱신 — 회전 자산에 한정.
      const dimsChanged = w !== r.width || h !== r.height
      const bhChanged = bh !== r.blurhash
      if (!dimsChanged && !bhChanged) continue

      changed += 1
      if (samples.length < 10) {
        samples.push(
          `${r.id}: ${r.width}x${r.height} -> ${w}x${h}${bhChanged ? ' (blurhash)' : ''}`,
        )
      }
      if (apply) {
        await prisma.asset.update({
          where: { id: r.id, familyId: r.family_id },
          data: { width: w, height: h, aspectRatioCached: ar, blurhash: bh },
        })
        updated += 1
      }
    } catch (e) {
      failed += 1
      logger.warn(
        { id: r.id, err: e instanceof Error ? e.message : String(e) },
        'backfill: failed for asset',
      )
    }
  }

  logger.info({ scanned, changed, updated, failed, apply }, 'orientation backfill done')
  for (const s of samples) logger.info({ sample: s }, 'backfill sample')
  process.exit(0)
}

main().catch((e) => {
  logger.fatal({ err: e instanceof Error ? e.message : String(e) }, 'backfill fatal')
  process.exit(1)
})
