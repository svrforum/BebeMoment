import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

/**
 * Grab up to N most-recently-attached asset ids per album in one query.
 * Each album is answered by its own LATERAL top-N (ORDER BY added_at DESC
 * LIMIT N), so the cost follows the number of albums listed, not the number
 * of attachments they hold — the previous ROW_NUMBER() window sorted every
 * attachment of every listed album before keeping the first 4.
 *
 * Returns a Map<albumId, assetId[]> with at most `perAlbum` entries each,
 * newest first; albums without a visible attachment have no entry.
 */
export async function previewAttachmentsByAlbum(
  args: {
    familyId: string
    albumIds: string[]
    perAlbum: number
    // family 에게 숨길 자산(비밀 스토리 사진) — 표지/프리뷰가 비밀 사진으로 채워지지
    // 않게 top-N 안에서 제외한다(다음 visible 자산이 표지가 됨).
    excludeAssetIds?: string[]
  },
  prismaPublic: PrismaPublic,
): Promise<Map<string, string[]>> {
  const { familyId, albumIds, perAlbum } = args
  if (albumIds.length === 0) return new Map()
  const exclude = args.excludeAssetIds ?? []

  const rows = await prismaPublic.$queryRaw<{ album_id: string; asset_id: string }[]>`
    SELECT t.album_id, t.asset_id
      FROM unnest(${albumIds}::uuid[]) AS ids(album_id)
      CROSS JOIN LATERAL (
        SELECT aa.album_id, aa.asset_id
          FROM public.album_assets aa
         WHERE aa.family_id = ${familyId}::uuid
           AND aa.album_id = ids.album_id
           AND aa.asset_id <> ALL(${exclude}::uuid[])
         ORDER BY aa.added_at DESC
         LIMIT ${perAlbum}
      ) t
  `

  const map = new Map<string, string[]>()
  for (const r of rows) {
    const list = map.get(r.album_id) ?? []
    list.push(r.asset_id)
    map.set(r.album_id, list)
  }
  return map
}
