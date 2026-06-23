import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { AssetUrls, MediaClient } from '@bebe/media-client'
import { hiddenAssetIdsForViewer } from '../story/secret-assets'

export type MilestonePickerAsset = { id: string; urls: AssetUrls | null }

const DEFAULT_LIMIT = 200

/**
 * 마일스톤 사진 선택기에 띄울 가족 자산(최근 촬영순). **family 역할에겐 비밀 스토리 사진을
 * 제외한다** — 선택기는 앱에서 유일한 "전체 자산 로드" surface 라 hiddenAssetIdsForViewer 를
 * 빠뜨리면 비밀 사진 바이트(서명 URL)가 그대로 새어나간다(Rule A). new/edit 페이지 공용.
 */
export async function listMilestonePickerAssets(
  args: { familyId: string; viewerRole: 'owner' | 'guardian' | 'family'; limit?: number },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<MilestonePickerAsset[]> {
  const hidden = await hiddenAssetIdsForViewer(args.viewerRole, prismaPublic, args.familyId)
  const assets = await prismaMedia.asset.findMany({
    where: {
      familyId: args.familyId,
      status: 'ready',
      deletedAt: null,
      ...(hidden.length ? { id: { notIn: hidden } } : {}),
    },
    orderBy: { takenAt: 'desc' },
    take: args.limit ?? DEFAULT_LIMIT,
  })
  const urlsMap = assets.length
    ? await media.getAssetUrlsBatch(
        args.familyId,
        assets.map((a) => a.id),
      )
    : {}
  return assets.map((a) => ({ id: a.id, urls: urlsMap[a.id] ?? null }))
}
