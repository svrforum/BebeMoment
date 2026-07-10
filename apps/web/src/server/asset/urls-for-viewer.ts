import { hiddenAssetIdsForViewer } from '@/server/story/secret-assets'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { AssetUrls, MediaClient } from '@bebe/media-client'

// PictureImage 의 서명 URL 이 만료돼 썸네일이 401 로 깨질 때 클라가 신선한 URL 을 다시 받는
// 자가치유 경로의 코어. **새 asset 노출 지점**이라 secret-assets 규칙을 반드시 적용한다
// (§21 / [[secret-story-asset-hiding]]) — family 역할은 비밀 스토리 자산을 제외하고 요청해도
// 서버가 다시 걸러, 임의 assetId 로 숨긴 사진 URL 을 우회 취득하지 못하게 한다.
export async function resolveAssetUrlsForViewer(
  args: { familyId: string; viewerRole: Role | 'owner' | 'guardian' | 'family'; ids: string[] },
  prismaPublic: PrismaPublic,
  media: MediaClient,
): Promise<Record<string, AssetUrls>> {
  const hidden = new Set(
    await hiddenAssetIdsForViewer(args.viewerRole, prismaPublic, args.familyId),
  )
  const visible = args.ids.filter((id) => !hidden.has(id))
  if (visible.length === 0) return {}
  return media.getAssetUrlsBatch(args.familyId, visible)
}
