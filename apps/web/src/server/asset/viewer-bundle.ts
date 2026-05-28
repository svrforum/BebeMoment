import { pickVideoPosterUrl, pickVideoUrl } from '@/lib/asset-url'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { AssetUrls, MediaClient } from '@bebe/media-client'
import { getAssetForFamily } from './get'

export type AssetSlim = {
  id: string
  kind: 'image' | 'video'
  urls: AssetUrls | null
  videoSrc: string | null
  posterUrl: string | undefined
}

export type ViewerBundle = {
  current: AssetSlim
  prev: AssetSlim | null
  next: AssetSlim | null
  prevId: string | undefined
  nextId: string | undefined
}

/**
 * 뷰어가 한 사진 → 인접 사진으로 클라이언트 사이드 이동할 때 다음 prev/current/next
 * 트리오를 한 번에 조달한다. SSR 의 page.tsx 와 클라이언트 API 라우트 양쪽에서 같은
 * 형상을 보장하기 위해 추출 — Swiper 가 마운트된 채로 슬라이드 데이터만 교체할 수
 * 있게 한다 (페이지 unmount→remount 가 없으면 chrome 깜빡임 없음).
 *
 * Tenant 격리: familyId 인자로만 조회. media SignedURL TTL 은 10분.
 */
export async function loadViewerBundle(
  args: { assetId: string; familyId: string },
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<ViewerBundle | null> {
  const asset = await getAssetForFamily(args, prismaMedia, media)
  if (!asset) return null

  const [prevAsset, nextAsset] = await Promise.all([
    prismaMedia.asset.findFirst({
      where: {
        familyId: args.familyId,
        deletedAt: null,
        status: 'ready',
        OR: [{ takenAt: { lt: asset.takenAt } }, { takenAt: asset.takenAt, id: { lt: asset.id } }],
      },
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      select: { id: true, kind: true },
    }),
    prismaMedia.asset.findFirst({
      where: {
        familyId: args.familyId,
        deletedAt: null,
        status: 'ready',
        OR: [{ takenAt: { gt: asset.takenAt } }, { takenAt: asset.takenAt, id: { gt: asset.id } }],
      },
      orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
      select: { id: true, kind: true },
    }),
  ])

  // 인접 두 슬롯은 batch 로 사인 — round-trip 한 번 절약.
  const adjIds = [prevAsset?.id, nextAsset?.id].filter((x): x is string => Boolean(x))
  const adjUrls = adjIds.length ? await media.getAssetUrlsBatch(args.familyId, adjIds) : {}

  function buildSlim(a: { id: string; kind: 'image' | 'video' } | null): AssetSlim | null {
    if (!a) return null
    const u = adjUrls[a.id] ?? null
    return {
      id: a.id,
      kind: a.kind,
      urls: u,
      videoSrc: a.kind === 'video' ? pickVideoUrl(u) : null,
      posterUrl: pickVideoPosterUrl(u) ?? undefined,
    }
  }

  const current: AssetSlim = {
    id: asset.id,
    kind: asset.kind,
    urls: asset.urls,
    videoSrc: asset.kind === 'video' ? pickVideoUrl(asset.urls) : null,
    posterUrl: pickVideoPosterUrl(asset.urls) ?? undefined,
  }

  return {
    current,
    prev: buildSlim(prevAsset ?? null),
    next: buildSlim(nextAsset ?? null),
    prevId: prevAsset?.id,
    nextId: nextAsset?.id,
  }
}
