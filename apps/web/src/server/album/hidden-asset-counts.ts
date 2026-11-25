import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'

/**
 * 앨범마다 이 뷰어가 못 보는 사진(비밀 스토리 사진) 수. 앨범 사진 수는 album_assets 를 그대로
 * 세므로 family 에게는 이만큼 빼야 사진 목록(listAlbumAssets)과 같은 수가 되고, 그 차이로 비밀
 * 사진이 몇 장인지 드러나지 않는다. owner/guardian 이거나 비밀 사진이 없으면 쿼리 없이 빈 맵.
 *
 * 스토리 가시성이 바뀌어도 앨범 캐시 태그는 비워지지 않으므로, 캐시한 목록에서도 이 값은 캐시
 * 밖에서 매번 구한다.
 */
export async function hiddenAssetCountsByAlbum(
  args: { familyId: string; albumIds: string[]; viewerRole: Role },
  prismaPublic: PrismaPublic,
): Promise<Map<string, number>> {
  if (args.albumIds.length === 0) return new Map()
  const hidden = await hiddenAssetIdsForViewer(args.viewerRole, prismaPublic, args.familyId)
  if (hidden.length === 0) return new Map()
  const rows = await prismaPublic.albumAsset.groupBy({
    by: ['albumId'],
    where: { familyId: args.familyId, albumId: { in: args.albumIds }, assetId: { in: hidden } },
    _count: { _all: true },
  })
  return new Map(rows.map((r) => [r.albumId, r._count._all]))
}
