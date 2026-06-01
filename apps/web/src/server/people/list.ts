import type { AssetWithUrls } from '@/server/asset/types'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { AssetUrls, MediaClient } from '@bebe/media-client'

export type FaceBox = { x: number; y: number; w: number; h: number }

export type PersonCover = { assetId: string; urls: AssetUrls | null; bbox: FaceBox }

export type PersonSummary = {
  id: string
  name: string | null
  faceCount: number
  cover: PersonCover | null
}

type LiveFaceRow = {
  person_id: string
  asset_id: string
  bbox_x: number
  bbox_y: number
  bbox_w: number
  bbox_h: number
  det_score: number
}

/**
 * 가족의 사람(군집) 목록 — **살아있는(미삭제·ready) 자산의 얼굴만** 기준으로 집계한다.
 * 그래서 사진을 지우면 그 사람의 장수가 줄고, 마지막 사진까지 지우면 목록에서 사라진다
 * (얼굴 행 자체는 남겨 둬 사진을 복원하면 다시 나타난다). 대표 얼굴은 살아있는 얼굴 중
 * 점수가 가장 높은 것을 골라 thumb URL + bbox 로 — bbox 중심 CSS 크롭에 쓴다.
 */
export async function listPeople(
  args: { familyId: string },
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PersonSummary[]> {
  const { familyId } = args

  const rows = await prismaMedia.$queryRawUnsafe<LiveFaceRow[]>(
    `SELECT f.person_id, f.asset_id, f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h, f.det_score
       FROM media.faces f
       JOIN media.assets a ON a.id = f.asset_id
      WHERE f.family_id = $1::uuid AND f.person_id IS NOT NULL
        AND a.deleted_at IS NULL AND a.status = 'ready'`,
    familyId,
  )
  if (rows.length === 0) return []

  type Agg = { count: number; best: LiveFaceRow }
  const byPerson = new Map<string, Agg>()
  for (const r of rows) {
    const cur = byPerson.get(r.person_id)
    if (!cur) byPerson.set(r.person_id, { count: 1, best: r })
    else {
      cur.count += 1
      if (r.det_score > cur.best.det_score) cur.best = r
    }
  }

  const personIds = [...byPerson.keys()]
  const persons = await prismaMedia.person.findMany({
    where: { id: { in: personIds }, familyId },
    select: { id: true, name: true },
  })
  const nameById = new Map(persons.map((p) => [p.id, p.name]))

  const coverAssetIds = Array.from(new Set([...byPerson.values()].map((a) => a.best.asset_id)))
  const urls = coverAssetIds.length ? await media.getAssetUrlsBatch(familyId, coverAssetIds) : {}

  return [...byPerson.entries()]
    .map(([personId, agg]) => ({
      id: personId,
      name: nameById.get(personId) ?? null,
      faceCount: agg.count,
      cover: {
        assetId: agg.best.asset_id,
        urls: urls[agg.best.asset_id] ?? null,
        bbox: { x: agg.best.bbox_x, y: agg.best.bbox_y, w: agg.best.bbox_w, h: agg.best.bbox_h },
      } satisfies PersonCover,
    }))
    .sort((a, b) => b.faceCount - a.faceCount || a.id.localeCompare(b.id))
}

/** 살아있는 얼굴이 1개 이상인 사람 수 — 진입점 뱃지용(목록과 같은 기준). */
export async function countPeople(
  args: { familyId: string },
  prismaMedia: PrismaMedia,
): Promise<number> {
  const rows = await prismaMedia.$queryRawUnsafe<{ c: number }[]>(
    `SELECT count(DISTINCT f.person_id)::int AS c
       FROM media.faces f
       JOIN media.assets a ON a.id = f.asset_id
      WHERE f.family_id = $1::uuid AND f.person_id IS NOT NULL
        AND a.deleted_at IS NULL AND a.status = 'ready'`,
    args.familyId,
  )
  return rows[0]?.c ?? 0
}

/**
 * 아직 이름을 안 붙인(=새로 잡힌·미확인) 사람이 1명 이상인지 — 타임라인 "사람" 진입점의
 * 알림 점(dot)용. 살아있는(미삭제·ready) 얼굴이 있는 사람만 센다(목록 기준과 동일).
 */
export async function hasUnnamedPerson(
  args: { familyId: string },
  prismaMedia: PrismaMedia,
): Promise<boolean> {
  const rows = await prismaMedia.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM media.persons p
        WHERE p.family_id = $1::uuid AND p.name IS NULL
          AND EXISTS (
            SELECT 1 FROM media.faces f
              JOIN media.assets a ON a.id = f.asset_id
             WHERE f.person_id = p.id AND a.deleted_at IS NULL AND a.status = 'ready'
          )
     ) AS exists`,
    args.familyId,
  )
  return rows[0]?.exists ?? false
}

export type PersonDetail = {
  person: { id: string; name: string | null } | null
  assets: AssetWithUrls[]
}

/** 한 사람의 사진(타임라인 포맷, 촬영일 내림차순). 같은 자산에 여러 얼굴이 있어도 1번만. */
export async function getPersonAssets(
  args: { familyId: string; personId: string },
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PersonDetail> {
  const { familyId, personId } = args
  const person = await prismaMedia.person.findFirst({
    where: { id: personId, familyId },
    select: { id: true, name: true },
  })
  if (!person) return { person: null, assets: [] }

  const faces = await prismaMedia.face.findMany({
    where: { familyId, personId },
    select: { assetId: true },
  })
  const assetIds = Array.from(new Set(faces.map((f) => f.assetId)))
  if (assetIds.length === 0) return { person, assets: [] }

  const assets = await prismaMedia.asset.findMany({
    where: {
      id: { in: assetIds },
      familyId,
      status: 'ready',
      deletedAt: null,
      duplicateOf: null,
    },
    orderBy: { takenAt: 'desc' },
  })
  const urls = assets.length
    ? await media.getAssetUrlsBatch(
        familyId,
        assets.map((a) => a.id),
      )
    : {}
  return {
    person,
    assets: assets.map((a) => ({ ...a, urls: urls[a.id] ?? null })),
  }
}

/** 사람 이름 변경(빈 문자열 → null = "이름 없음"). family 스코프 강제. */
export async function renamePerson(
  args: { familyId: string; personId: string; name: string | null },
  prismaMedia: PrismaMedia,
): Promise<void> {
  const trimmed = args.name?.trim() ?? ''
  await prismaMedia.person.updateMany({
    where: { id: args.personId, familyId: args.familyId },
    data: { name: trimmed === '' ? null : trimmed },
  })
}
