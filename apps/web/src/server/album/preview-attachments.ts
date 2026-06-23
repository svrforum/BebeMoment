import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

/**
 * Grab up to N most-recently-attached asset ids per album in one query
 * via a window function. Replaces the previous "load every attachment +
 * group in JS" pattern, which scaled with total photos in albums (a
 * 1000-photo family would ship 1000 rows over the wire only to slice the
 * first 4 per group).
 *
 * Returns a Map<albumId, assetId[]> with at most `perAlbum` entries each.
 */
export async function previewAttachmentsByAlbum(
  args: {
    familyId: string
    albumIds: string[]
    perAlbum: number
    // family 에게 숨길 자산(비밀 스토리 사진) — 표지/프리뷰가 비밀 사진으로 채워지지
    // 않게 ROW_NUMBER 윈도 전에 제외한다(다음 visible 자산이 표지가 됨).
    excludeAssetIds?: string[]
  },
  prismaPublic: PrismaPublic,
): Promise<Map<string, string[]>> {
  const { familyId, albumIds, perAlbum } = args
  if (albumIds.length === 0) return new Map()
  const exclude = args.excludeAssetIds ?? []

  const rows = await prismaPublic.$queryRaw<{ album_id: string; asset_id: string }[]>`
    SELECT album_id, asset_id FROM (
      SELECT
        album_id,
        asset_id,
        ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY added_at DESC) AS rn
      FROM public.album_assets
      WHERE family_id = ${familyId}::uuid
        AND album_id = ANY(${albumIds}::uuid[])
        AND asset_id <> ALL(${exclude}::uuid[])
    ) t
    WHERE rn <= ${perAlbum}
    ORDER BY album_id, rn
  `

  const map = new Map<string, string[]>()
  for (const r of rows) {
    const list = map.get(r.album_id) ?? []
    list.push(r.asset_id)
    map.set(r.album_id, list)
  }
  return map
}
