import { GRID_URL_TIERS, type GridAssetUrls, toGridUrls } from '@/lib/asset-url'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

export type CooccurringPerson = {
  id: string
  name: string | null
  /** 이 사람과 함께 찍힌 사진 수(사진 단위, 얼굴 수 아님). */
  photoCount: number
  /** 얼굴 동그라미용 — 그 사람의 대표 얼굴(가장 점수 높은)과 크롭 위치. */
  cover: { assetId: string; urls: GridAssetUrls | null; bbox: FaceBox } | null
}

export type FaceBox = { x: number; y: number; w: number; h: number }

export type Cooccurrence = {
  /** 사진 id → 그 사진에 함께 있는 다른 사람들(함께 찍힌 사진이 많은 순). */
  byAsset: Record<string, CooccurringPerson[]>
  /** 함께 찍힌 사진이 많은 순. 비어 있으면 이 사람은 늘 혼자 찍혔다는 뜻. */
  summary: CooccurringPerson[]
}

type Row = { asset_id: string; person_id: string; name: string | null }
type CoverRow = {
  person_id: string
  asset_id: string
  bbox_x: number
  bbox_y: number
  bbox_w: number
  bbox_h: number
}

/**
 * 이 사람이 나온 사진에 **함께** 나온 다른 사람들.
 *
 * 왜 필요한가: 군집이 잘게 쪼개지면 "이름없음" 이 이미 이름 붙인 사람과 같은 사람인지
 * 판단하기 어렵다. 그런데 한 사진에 두 얼굴이 따로 잡혔다면 그건 보통 **다른 사람**이다
 * (한 사람이 한 사진에 두 번 나오지는 않으니까). 그래서 이 정보를 화면에 보여 주면
 * 합칠지 새 사람으로 둘지 바로 판단할 수 있다.
 *
 * 집계 기준은 목록·상세와 같다: 살아있는(미삭제·ready·별칭아님) 사진의 얼굴만,
 * family 역할에겐 비밀 스토리 사진 제외.
 */
export async function listCooccurringPeople(
  args: { familyId: string; personId: string; viewerRole?: Role },
  prismaMedia: PrismaMedia,
  prismaPublic?: PrismaPublic,
  media?: MediaClient,
): Promise<Cooccurrence> {
  const { familyId, personId } = args
  const hidden =
    args.viewerRole === 'family' && prismaPublic
      ? await hiddenAssetIdsForViewer('family', prismaPublic, familyId)
      : []

  const rows = await prismaMedia.$queryRawUnsafe<Row[]>(
    `WITH live AS (
       SELECT f.asset_id, f.person_id
         FROM media.faces f
         JOIN media.assets a ON a.id = f.asset_id
        WHERE f.family_id = $1::uuid AND f.person_id IS NOT NULL
          AND a.deleted_at IS NULL AND a.status = 'ready' AND a.duplicate_of IS NULL
          AND f.asset_id <> ALL($3::uuid[])
     ),
     mine AS (SELECT DISTINCT asset_id FROM live WHERE person_id = $2::uuid)
     SELECT DISTINCT l.asset_id, l.person_id, p.name
       FROM live l
       JOIN mine m ON m.asset_id = l.asset_id
       LEFT JOIN media.persons p ON p.id = l.person_id AND p.family_id = $1::uuid
      WHERE l.person_id <> $2::uuid`,
    familyId,
    personId,
    hidden,
  )

  const photos = new Map<string, { name: string | null; assets: Set<string> }>()
  for (const r of rows) {
    const e = photos.get(r.person_id) ?? { name: r.name, assets: new Set<string>() }
    e.assets.add(r.asset_id)
    photos.set(r.person_id, e)
  }
  const summary: CooccurringPerson[] = [...photos.entries()]
    .map(([id, e]) => ({ id, name: e.name, photoCount: e.assets.size, cover: null }))
    .sort((a, b) => b.photoCount - a.photoCount || a.id.localeCompare(b.id))

  // 얼굴 동그라미 — 목록 화면과 같은 기준(살아있는 얼굴 중 점수 최고)으로 고른다.
  if (media && summary.length > 0) {
    const covers = await prismaMedia.$queryRawUnsafe<CoverRow[]>(
      `SELECT DISTINCT ON (f.person_id)
              f.person_id, f.asset_id, f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h
         FROM media.faces f
         JOIN media.assets a ON a.id = f.asset_id
        WHERE f.family_id = $1::uuid AND f.person_id = ANY($2::uuid[])
          AND a.deleted_at IS NULL AND a.status = 'ready' AND a.duplicate_of IS NULL
        ORDER BY f.person_id, f.det_score DESC, f.asset_id`,
      familyId,
      summary.map((p) => p.id),
    )
    const urls = await media.getAssetUrlsBatch(
      familyId,
      [...new Set(covers.map((c) => c.asset_id))],
      { tiers: GRID_URL_TIERS },
    )
    const byPerson = new Map(covers.map((c) => [c.person_id, c]))
    for (const p of summary) {
      const c = byPerson.get(p.id)
      p.cover = c
        ? {
            assetId: c.asset_id,
            urls: toGridUrls(urls[c.asset_id]),
            bbox: { x: c.bbox_x, y: c.bbox_y, w: c.bbox_w, h: c.bbox_h },
          }
        : null
    }
  }

  const rank = new Map(summary.map((p, i) => [p.id, i]))
  const byAsset: Record<string, CooccurringPerson[]> = {}
  for (const r of rows) {
    const person = summary[rank.get(r.person_id) ?? -1]
    if (!person) continue
    let list = byAsset[r.asset_id]
    if (!list) {
      list = []
      byAsset[r.asset_id] = list
    }
    if (!list.some((p) => p.id === person.id)) list.push(person)
  }
  for (const list of Object.values(byAsset)) {
    list.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  }
  return { byAsset, summary }
}
