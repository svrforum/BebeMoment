import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { Baby, Story, StoryAsset, PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import type { AssetWithUrls } from '../asset/types'
import { hiddenAssetIdsForViewer } from './secret-assets'

export async function getStoryEntry(
  idOrPublicNo: string,
  familyId: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
  // 기본값은 제한적인 'family' — 호출부가 역할을 빠뜨려도 guardians-only 스토리가
  // 새지 않게(defense-in-depth). 실제 소비자는 모두 명시적 role 을 넘긴다.
  viewerRole: 'owner' | 'guardian' | 'family' = 'family',
): Promise<
  | (Story & {
      assets: (StoryAsset & { asset: AssetWithUrls | null })[]
      baby: Baby | null
    })
  | null
> {
  const numeric = /^\d+$/.test(idOrPublicNo)
  const entry = await prismaPublic.story.findFirst({
    where: {
      ...(numeric ? { publicNo: Number(idOrPublicNo) } : { id: idOrPublicNo }),
      familyId,
      deletedAt: null,
      // guardians-only entries are hidden from the `family` role (returns null → 404)
      ...(viewerRole === 'family' ? { visibility: 'family' } : {}),
    },
    include: { assets: true, baby: true },
  })
  if (!entry) return null

  // family 가 보는 (가족 공개) 스토리라도, 그 사진이 비밀 스토리에도 속해 있으면
  // 하이드레이션에서 제외(Rule A 일관 — 비밀 사진은 어디서도 안 보인다).
  const hidden = new Set(await hiddenAssetIdsForViewer(viewerRole, prismaPublic, familyId))
  const assetIds = entry.assets.map((ea) => ea.assetId).filter((id) => !hidden.has(id))
  const assets = assetIds.length
    ? await prismaMedia.asset.findMany({
        where: { id: { in: assetIds }, familyId, deletedAt: null },
      })
    : []
  const byId = new Map(assets.map((a) => [a.id, a]))

  const readyIds = assets.filter((a) => a.status === 'ready').map((a) => a.id)
  const urlsMap = readyIds.length ? await media.getAssetUrlsBatch(familyId, readyIds) : {}

  return {
    ...entry,
    assets: entry.assets
      .filter((ea) => !hidden.has(ea.assetId))
      .map((ea) => {
        const base = byId.get(ea.assetId) ?? null
        const withUrls: AssetWithUrls | null = base
          ? { ...base, urls: base.status === 'ready' ? (urlsMap[base.id] ?? null) : null }
          : null
        return { ...ea, asset: withUrls }
      }),
  }
}
