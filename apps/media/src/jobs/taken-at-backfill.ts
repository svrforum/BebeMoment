import { buffer } from 'node:stream/consumers'
import { parseExif, wallClockAsUtc } from '@bebe/core'
import { Prisma, type PrismaClient } from '@bebe/db-media'
import type { StorageAdapter } from '@bebe/storage'

/**
 * 실제 순간으로 저장된 촬영 시각(taken_at)을 벽시계(wall-clock-as-UTC)로 되돌린다.
 *
 * 단계마다 늘 원래 값에서 다시 계산해서, 몇 번을 돌려도 결과가 같다.
 * - EXIF 사진: 원본의 EXIF 를 다시 읽는다. 벽시계가 거기 그대로 있다.
 * - 업로드 시각: 그대로 남아 있는 uploaded_at(실제 순간)을 벽시계로 옮긴다.
 * - 파일 수정시각: file_modified_at(실제 순간)을 벽시계로 옮긴다. 이 열이 빈 행은 2026-10 전 init 이
 *   실제 순간을 taken_at 에 바로 넣은 것이라, 그 값을 file_modified_at 에 남기면서 옮긴다.
 * - 날짜 칸을 눌렀다 떼기만 해서 '수동'이 된 행: 그때 값을 분 단위로 자른 것이라 알아볼 수 있어
 *   원래 출처로 되돌린다. 사용자가 실제로 고친 행은 둔다.
 * - 중복 별칭: 원본을 따라간다. 원본 행이 영구삭제된 별칭은 EXIF·파일 수정시각이면 스스로 고치고,
 *   업로드 시각이면 둔다(물려받은 값이라 자기 uploaded_at 에서 다시 셀 수 없다).
 *
 * 영상 메타데이터와 파일명 출처는 처음부터 벽시계라 건드리지 않는다. 실제 순간은 이 프로세스의
 * 벽시계로 옮긴다 — 컨테이너 안에서(docker exec) 돌려야 인스턴스 TZ 가 맞는다.
 */
export type TakenAtBackfillReport = {
  exif: { checked: number; fixed: number; noDate: number; unreadable: number }
  manual: { checked: number; restored: number }
  uploaded: { fixed: number }
  filemtime: { fixed: number }
  aliases: { fixed: number }
}

type Logger = {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
}

export type TakenAtBackfillDeps = {
  prisma: PrismaClient
  storage: StorageAdapter
  dryRun: boolean
  logger: Logger
}

type Row = {
  id: string
  familyId: string
  takenAt: Date
  source: 'exif' | 'filename' | 'filemtime' | 'manual' | 'uploaded'
}

// 별칭이 아니거나, 따라갈 원본 행이 영구삭제돼 스스로 고쳐야 하는 행.
const STANDALONE = Prisma.sql`(
  a.duplicate_of IS NULL
  OR NOT EXISTS (SELECT 1 FROM media.assets c WHERE c.id = a.duplicate_of)
)`

/**
 * 처음 읽은 값 그대로일 때만 쓴다 — 도는 사이에 사용자가 고친 날짜나 워커가 새로 쓴 값을 덮어쓰지
 * 않는다. 가족 전체를 훑는 유지보수 스캔이라 읽기는 $queryRaw 로 tenant 미들웨어를 비켜 가고,
 * 쓰기는 familyId 를 걸어 스코프를 지킨다(backfill-video-taken-at 과 같은 방식).
 */
async function writeIfUnchanged(
  { prisma, dryRun, logger }: TakenAtBackfillDeps,
  row: Row,
  data: { takenAt: Date; takenAtSource: Row['source']; fileModifiedAt?: Date },
): Promise<boolean> {
  logger.info(
    {
      assetId: row.id,
      source: row.source,
      from: row.takenAt.toISOString(),
      to: data.takenAt.toISOString(),
    },
    dryRun ? 'would fix taken_at' : 'fixing taken_at',
  )
  if (dryRun) return true
  const { count } = await prisma.asset.updateMany({
    where: {
      id: row.id,
      familyId: row.familyId,
      takenAt: row.takenAt,
      takenAtSource: row.source,
    },
    data,
  })
  if (count === 0) logger.warn({ assetId: row.id }, 'taken_at changed meanwhile — left as is')
  return count > 0
}

/** 처리할 때 exif_raw 에 남은, 서버 시간대로 되살린 EXIF 날짜(ISO). */
function savedExifInstant(exifRaw: unknown): Date | undefined {
  if (!exifRaw || typeof exifRaw !== 'object') return undefined
  const raw = exifRaw as Record<string, unknown>
  const value = raw.DateTimeOriginal ?? raw.CreateDate
  if (typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isNaN(+date) ? undefined : date
}

const toMinute = (d: Date): number => Math.floor(d.getTime() / 60_000) * 60_000

async function backfillImages(
  deps: TakenAtBackfillDeps,
  report: TakenAtBackfillReport,
): Promise<void> {
  const { prisma, storage, logger } = deps
  const rows = await prisma.$queryRaw<(Row & { originalKey: string; exifRaw: unknown })[]>`
    SELECT a.id,
           a.family_id             AS "familyId",
           a.original_key          AS "originalKey",
           a.taken_at              AS "takenAt",
           a.taken_at_source::text AS "source",
           a.exif_raw              AS "exifRaw"
    FROM media.assets a
    WHERE a.kind = 'image'
      AND ${STANDALONE}
      AND (a.taken_at_source = 'exif' OR (a.taken_at_source = 'manual' AND a.exif_raw IS NOT NULL))
    ORDER BY a.uploaded_at ASC
  `

  for (const row of rows) {
    const manual = row.source === 'manual'
    if (manual) {
      report.manual.checked += 1
      // 편집기가 분 단위로 자른 바로 그 값일 때만 — 사용자가 실제로 고친 날짜는 지키고 넘어간다.
      const saved = savedExifInstant(row.exifRaw)
      if (!saved || toMinute(saved) !== row.takenAt.getTime()) continue
    } else {
      report.exif.checked += 1
    }

    let takenAt: Date | undefined
    try {
      takenAt = (await parseExif(await buffer(await storage.read(row.originalKey)))).takenAt
    } catch (err) {
      if (!manual) report.exif.unreadable += 1
      logger.warn({ assetId: row.id, err }, 'cannot read the original — taken_at left as is')
      continue
    }
    if (!takenAt) {
      // 변환(HEIC→JPEG)된 원본은 EXIF 가 지워져 있다 — 다시 읽을 곳이 없다.
      if (!manual) report.exif.noDate += 1
      logger.warn({ assetId: row.id }, 'no EXIF date in the original — taken_at left as is')
      continue
    }
    if (!manual && takenAt.getTime() === row.takenAt.getTime()) continue

    if (await writeIfUnchanged(deps, row, { takenAt, takenAtSource: 'exif' })) {
      if (manual) report.manual.restored += 1
      else report.exif.fixed += 1
    }
  }
}

/** 업로드 시각 — uploaded_at(실제 순간)에서 다시 계산한다. */
async function backfillUploaded(
  deps: TakenAtBackfillDeps,
  report: TakenAtBackfillReport,
): Promise<void> {
  const rows = await deps.prisma.$queryRaw<(Row & { uploadedAt: Date })[]>`
    SELECT a.id,
           a.family_id             AS "familyId",
           a.taken_at              AS "takenAt",
           a.taken_at_source::text AS "source",
           a.uploaded_at           AS "uploadedAt"
    FROM media.assets a
    -- 별칭은 원본의 날짜를 물려받았다(자기 uploaded_at 은 다시 올린 시각이다) — 원본이 사라져도
    -- 다시 세지 않는다.
    WHERE a.duplicate_of IS NULL
      AND (
        a.taken_at_source = 'uploaded'
        OR (a.taken_at_source = 'manual'
            AND a.exif_raw->>'DateTimeOriginal' IS NULL AND a.exif_raw->>'CreateDate' IS NULL
            AND a.taken_at = date_trunc('minute', a.uploaded_at))
      )
  `
  for (const row of rows) {
    const takenAt = wallClockAsUtc(row.uploadedAt)
    if (row.source === 'uploaded' && takenAt.getTime() === row.takenAt.getTime()) continue
    if (await writeIfUnchanged(deps, row, { takenAt, takenAtSource: 'uploaded' })) {
      report.uploaded.fixed += 1
    }
  }
}

/** 파일 수정시각 — file_modified_at(실제 순간)에서 다시 계산한다. 빈 행은 taken_at 이 그 순간이다. */
async function backfillFileModified(
  deps: TakenAtBackfillDeps,
  report: TakenAtBackfillReport,
): Promise<void> {
  const rows = await deps.prisma.$queryRaw<(Row & { fileModifiedAt: Date | null })[]>`
    SELECT a.id,
           a.family_id             AS "familyId",
           a.taken_at              AS "takenAt",
           a.taken_at_source::text AS "source",
           a.file_modified_at      AS "fileModifiedAt"
    FROM media.assets a
    WHERE ${STANDALONE} AND a.taken_at_source = 'filemtime'
  `
  for (const row of rows) {
    const instant = row.fileModifiedAt ?? row.takenAt
    const takenAt = wallClockAsUtc(instant)
    if (row.fileModifiedAt && takenAt.getTime() === row.takenAt.getTime()) continue
    const data = { takenAt, takenAtSource: 'filemtime' as const, fileModifiedAt: instant }
    if (await writeIfUnchanged(deps, row, data)) report.filemtime.fixed += 1
  }
}

/** 원본의 수동 날짜를 그대로 물려받은 별칭 — 고치기 전에 원본과 같던 것. */
async function inheritedManualAliases(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a.id
    FROM media.assets a
    JOIN media.assets c ON c.id = a.duplicate_of AND c.family_id = a.family_id
    WHERE a.taken_at_source = 'manual'
      AND c.taken_at_source = 'manual'
      AND a.taken_at = c.taken_at
  `
  return rows.map((r) => r.id)
}

/**
 * 중복 별칭 — 원본의 촬영 시각을 원래 순간(file_modified_at)까지 그대로 따른다. 그래야 나중에 원본
 * 행이 영구삭제돼 별칭이 혼자 남아도 같은 값이 나온다. 별칭만 따로 직접 고친 경우는 둔다.
 */
async function backfillAliases(
  { prisma, dryRun }: TakenAtBackfillDeps,
  report: TakenAtBackfillReport,
  inheritedManual: string[],
): Promise<void> {
  // dry-run 은 원본이 아직 안 고쳐진 상태라 지금 어긋난 별칭만 센다.
  const target = Prisma.sql`
    a.duplicate_of = c.id
    AND a.family_id = c.family_id
    AND (a.taken_at_source <> 'manual' OR a.id = ANY(${inheritedManual}::uuid[]))
    AND (
      a.taken_at IS DISTINCT FROM c.taken_at
      OR a.taken_at_source IS DISTINCT FROM c.taken_at_source
      OR a.file_modified_at IS DISTINCT FROM c.file_modified_at
    )`
  if (dryRun) {
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM media.assets a, media.assets c WHERE ${target}`
    report.aliases.fixed = Number(row?.n ?? 0)
    return
  }
  report.aliases.fixed = await prisma.$executeRaw`
    UPDATE media.assets a
    SET taken_at = c.taken_at,
        taken_at_source = c.taken_at_source,
        file_modified_at = c.file_modified_at
    FROM media.assets c
    WHERE ${target}`
}

export async function backfillTakenAt(deps: TakenAtBackfillDeps): Promise<TakenAtBackfillReport> {
  const report: TakenAtBackfillReport = {
    exif: { checked: 0, fixed: 0, noDate: 0, unreadable: 0 },
    manual: { checked: 0, restored: 0 },
    uploaded: { fixed: 0 },
    filemtime: { fixed: 0 },
    aliases: { fixed: 0 },
  }
  // 원본이 고쳐지기 전에 봐 둬야 물려받은 것인지 안다.
  const inheritedManual = await inheritedManualAliases(deps.prisma)
  await backfillImages(deps, report)
  await backfillUploaded(deps, report)
  await backfillFileModified(deps, report)
  // 별칭은 원본이 다 고쳐진 다음에.
  await backfillAliases(deps, report, inheritedManual)
  return report
}
