import type { AssetWithUrls } from '@/server/asset/types'
import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { AssetUrls, MediaClient } from '@bebe/media-client'

export type FaceBox = { x: number; y: number; w: number; h: number }

export type PersonCover = { assetId: string; urls: AssetUrls | null; bbox: FaceBox }

export type PersonSummary = {
  id: string
  name: string | null
  /** 고유 사진 수(상세 화면과 동일 기준). 한 사진에 같은 사람이 여러 번 검출돼도 1장. */
  photoCount: number
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
  args: { familyId: string; viewerRole?: Role },
  prismaMedia: PrismaMedia,
  media: MediaClient,
  prismaPublic?: PrismaPublic,
): Promise<PersonSummary[]> {
  const { familyId } = args

  const rowsRaw = await prismaMedia.$queryRawUnsafe<LiveFaceRow[]>(
    `SELECT f.person_id, f.asset_id, f.bbox_x, f.bbox_y, f.bbox_w, f.bbox_h, f.det_score
       FROM media.faces f
       JOIN media.assets a ON a.id = f.asset_id
      WHERE f.family_id = $1::uuid AND f.person_id IS NOT NULL
        AND a.deleted_at IS NULL AND a.status = 'ready'
        AND a.duplicate_of IS NULL`,
    familyId,
  )
  // family 에게는 비밀 스토리 사진의 얼굴을 인물 집계에서 제외(사진까지 숨김 일관).
  const hidden =
    args.viewerRole === 'family' && prismaPublic
      ? new Set(await hiddenAssetIdsForViewer('family', prismaPublic, familyId))
      : new Set<string>()
  const rows = hidden.size ? rowsRaw.filter((r) => !hidden.has(r.asset_id)) : rowsRaw
  if (rows.length === 0) return []

  // 사진 수는 고유 asset 기준 — 상세(getPersonAssets)와 일치시킨다. face 행 수로 세면
  // 한 사진에 같은 얼굴이 여러 번 검출됐을 때 목록("사진 N장")과 상세 장수가 어긋난다.
  type Agg = { assets: Set<string>; best: LiveFaceRow }
  const byPerson = new Map<string, Agg>()
  for (const r of rows) {
    const cur = byPerson.get(r.person_id)
    if (!cur) byPerson.set(r.person_id, { assets: new Set([r.asset_id]), best: r })
    else {
      cur.assets.add(r.asset_id)
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
      photoCount: agg.assets.size,
      cover: {
        assetId: agg.best.asset_id,
        urls: urls[agg.best.asset_id] ?? null,
        bbox: { x: agg.best.bbox_x, y: agg.best.bbox_y, w: agg.best.bbox_w, h: agg.best.bbox_h },
      } satisfies PersonCover,
    }))
    .sort((a, b) => b.photoCount - a.photoCount || a.id.localeCompare(b.id))
}

/** 살아있는 얼굴이 1개 이상인 사람 수 — 진입점 뱃지용(목록과 같은 기준). */
export async function countPeople(
  args: { familyId: string; viewerRole?: Role },
  prismaMedia: PrismaMedia,
  prismaPublic?: PrismaPublic,
): Promise<number> {
  const hidden =
    args.viewerRole === 'family' && prismaPublic
      ? await hiddenAssetIdsForViewer('family', prismaPublic, args.familyId)
      : []
  const rows = hidden.length
    ? await prismaMedia.$queryRawUnsafe<{ c: number }[]>(
        `SELECT count(DISTINCT f.person_id)::int AS c
           FROM media.faces f
           JOIN media.assets a ON a.id = f.asset_id
          WHERE f.family_id = $1::uuid AND f.person_id IS NOT NULL
            AND a.deleted_at IS NULL AND a.status = 'ready'
            AND f.asset_id <> ALL($2::uuid[])`,
        args.familyId,
        hidden,
      )
    : await prismaMedia.$queryRawUnsafe<{ c: number }[]>(
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
  args: { familyId: string; viewerRole?: Role },
  prismaMedia: PrismaMedia,
  prismaPublic?: PrismaPublic,
): Promise<boolean> {
  const hidden =
    args.viewerRole === 'family' && prismaPublic
      ? await hiddenAssetIdsForViewer('family', prismaPublic, args.familyId)
      : []
  const rows = hidden.length
    ? await prismaMedia.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (
           SELECT 1 FROM media.persons p
            WHERE p.family_id = $1::uuid AND p.name IS NULL
              AND EXISTS (
                SELECT 1 FROM media.faces f
                  JOIN media.assets a ON a.id = f.asset_id
                 WHERE f.person_id = p.id AND a.deleted_at IS NULL AND a.status = 'ready'
                   AND f.asset_id <> ALL($2::uuid[])
              )
         ) AS exists`,
        args.familyId,
        hidden,
      )
    : await prismaMedia.$queryRawUnsafe<{ exists: boolean }[]>(
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
  /** 상한(MAX_PERSON_ASSETS)을 넘겨 일부만 표시 중인지. */
  truncated: boolean
}

const MAX_PERSON_ASSETS = 500

/** 한 사람의 사진(타임라인 포맷, 촬영일 내림차순). 같은 자산에 여러 얼굴이 있어도 1번만.
 *  가장 많이 찍히는 사람(아기)도 무제한 로드하지 않도록 상한을 둔다(앨범과 동일 패턴). */
export async function getPersonAssets(
  args: { familyId: string; personId: string; viewerRole?: Role },
  prismaMedia: PrismaMedia,
  media: MediaClient,
  prismaPublic?: PrismaPublic,
): Promise<PersonDetail> {
  const { familyId, personId } = args
  const person = await prismaMedia.person.findFirst({
    where: { id: personId, familyId },
    select: { id: true, name: true },
  })
  if (!person) return { person: null, assets: [], truncated: false }

  const faces = await prismaMedia.face.findMany({
    where: { familyId, personId },
    select: { assetId: true },
  })
  // family 에게는 비밀 스토리 사진을 인물 상세에서도 제외.
  const hidden =
    args.viewerRole === 'family' && prismaPublic
      ? new Set(await hiddenAssetIdsForViewer('family', prismaPublic, familyId))
      : new Set<string>()
  const assetIds = Array.from(new Set(faces.map((f) => f.assetId))).filter((id) => !hidden.has(id))
  if (assetIds.length === 0) return { person, assets: [], truncated: false }

  const rows = await prismaMedia.asset.findMany({
    where: {
      id: { in: assetIds },
      familyId,
      status: 'ready',
      deletedAt: null,
      duplicateOf: null,
    },
    orderBy: { takenAt: 'desc' },
    take: MAX_PERSON_ASSETS + 1,
  })
  const truncated = rows.length > MAX_PERSON_ASSETS
  const assets = truncated ? rows.slice(0, MAX_PERSON_ASSETS) : rows
  const urls = assets.length
    ? await media.getAssetUrlsBatch(
        familyId,
        assets.map((a) => a.id),
      )
    : {}
  return {
    person,
    assets: assets.map((a) => ({ ...a, urls: urls[a.id] ?? null })),
    truncated,
  }
}

/**
 * 두 사람(군집)을 합친다 — source 의 모든 얼굴을 target 으로 옮기고 source 사람 행을
 * 삭제한다. 같은 사람을 여러 군집으로 잘못 나눴을 때 하나로 모으는 용도. family 스코프.
 *
 * ⚠️ 순서 중요: Face.person 은 onDelete:SetNull 이라 source 를 **먼저 지우면** 얼굴들의
 * personId 가 null 로 풀려 미배정으로 흩어진다. 반드시 얼굴을 target 으로 옮긴 뒤 삭제.
 * 두 사람이 모두 이 family 의 것이어야 하며(cross-family 차단), 동일 id 는 거부한다.
 */
export async function mergePeople(
  args: { familyId: string; sourceId: string; targetId: string },
  prismaMedia: PrismaMedia,
): Promise<{ moved: number }> {
  const { familyId, sourceId, targetId } = args
  if (sourceId === targetId) throw new Error('cannot merge a person into itself')
  const found = await prismaMedia.person.findMany({
    where: { id: { in: [sourceId, targetId] }, familyId },
    select: { id: true },
  })
  if (found.length !== 2) throw new Error('person not found')
  return await prismaMedia.$transaction(async (tx) => {
    const moved = await tx.face.updateMany({
      where: { familyId, personId: sourceId },
      data: { personId: targetId },
    })
    await tx.person.deleteMany({ where: { id: sourceId, familyId } })
    return { moved: moved.count }
  })
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
