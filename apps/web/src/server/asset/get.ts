import { isAssetHiddenFromViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from './types'

export type { AssetWithUrls } from './types'

/**
 * 가족 스코프 단일 자산 조회. `viewerRole`+`prismaPublic` 이 주어지고 뷰어가 `family`
 * 인데 자산이 비밀 스토리에 속하면 `null`(상위에서 404) — family 가 비밀 스토리 사진을
 * 단일 뷰어/딥링크로 직접 여는 것을 막는다. owner/guardian 은 추가 쿼리 없이 그대로.
 */
export async function getAssetForFamily(
  args: { assetId: string; familyId: string; viewerRole?: Role },
  prismaMedia: PrismaMedia,
  media: MediaClient,
  prismaPublic?: PrismaPublic,
): Promise<AssetWithUrls | null> {
  const asset = await prismaMedia.asset.findFirst({
    where: { id: args.assetId, familyId: args.familyId, deletedAt: null },
  })
  if (!asset) return null
  if (
    args.viewerRole === 'family' &&
    prismaPublic &&
    (await isAssetHiddenFromViewer('family', asset.id, prismaPublic, args.familyId))
  ) {
    return null
  }
  const urls = asset.status === 'ready' ? await media.getAssetUrls(asset.id, args.familyId) : null
  return { ...asset, urls }
}
