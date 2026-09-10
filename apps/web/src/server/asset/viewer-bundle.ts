import { pickVideoPosterUrl, pickVideoUrl } from '@/lib/asset-url'
import { listSecretAssetIds } from '@/server/story/secret-assets'
import type { TimelineSort } from '@/server/timeline/merged-list'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic, Role } from '@bebe/db-public'
import type { AssetUrls, MediaClient } from '@bebe/media-client'
import { getAssetForFamily } from './get'

export type AssetSlim = {
  id: string
  publicNo: number
  kind: 'image' | 'video'
  /** 뷰어가 "왜 안 보이는지"를 말할 수 있게 — 실패한 자산에 '처리 중'이라고 하면 안 된다. */
  status: 'uploading' | 'processing' | 'ready' | 'failed'
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
  args: {
    assetId: string
    familyId: string
    sort?: TimelineSort
    /** 추억·앨범 등 특정 컬렉션에서 열렸으면 그 순서대로의 자산 UUID 목록. 주어지면
     *  prev/next 를 전역 타임라인이 아니라 이 목록 안에서 찾는다(컬렉션 이탈 방지). */
    neighborIds?: string[]
    /** 목록에서 대상을 못 찾았을 때 전역(시간순) 이웃으로 넘어갈지. 타임라인처럼 무한
     *  목록의 일부만 받은 경우에만 true — 앨범·스토리는 경계를 지켜야 하므로 false. */
    neighborFallbackToGlobal?: boolean
    /** 뷰어 역할 — family 면 비밀 스토리 사진을 현재 자산(404)·전역 prev/next 에서 제외.
     *  prismaPublic 과 함께 주어져야 동작(없으면 비밀 필터 미적용). */
    viewerRole?: Role
  },
  prismaMedia: PrismaMedia,
  media: MediaClient,
  prismaPublic?: PrismaPublic,
): Promise<ViewerBundle | null> {
  // assetId may be the sequential publicNo (page URL) or the UUID (API route).
  let uuid = args.assetId
  if (/^\d+$/.test(args.assetId)) {
    const resolved = await prismaMedia.asset.findFirst({
      where: { publicNo: Number(args.assetId), familyId: args.familyId, deletedAt: null },
      select: { id: true },
    })
    if (!resolved) return null
    uuid = resolved.id
  }

  const asset = await getAssetForFamily(
    {
      assetId: uuid,
      familyId: args.familyId,
      ...(args.viewerRole ? { viewerRole: args.viewerRole } : {}),
    },
    prismaMedia,
    media,
    prismaPublic,
  )
  if (!asset) return null

  // 전역 prev/next(컬렉션 밖)에서도 family 에게 비밀 사진을 제외한다. neighborIds 경로는
  // 상위 컬렉션 목록이 이미 비밀 필터를 거쳐 안전하다.
  const hidden =
    args.viewerRole === 'family' && prismaPublic
      ? await listSecretAssetIds(prismaPublic, args.familyId)
      : []

  // prev/next 의 정렬 기준은 타임라인과 일치해야 한다 — 업로드순(createdAt)으로 보던
  // 사용자가 뷰어를 열면 스와이프 이웃도 createdAt 기준이어야 그리드와 어긋나지 않는다.
  const baseWhere = {
    familyId: args.familyId,
    deletedAt: null,
    status: 'ready' as const,
    duplicateOf: null,
    ...(hidden.length ? { id: { notIn: hidden } } : {}),
  }
  const select = { id: true, publicNo: true, kind: true, status: true } as const
  type Slim = {
    id: string
    publicNo: number
    kind: 'image' | 'video'
    status: 'uploading' | 'processing' | 'ready' | 'failed'
  }
  let prevAsset: Slim | null = null
  let nextAsset: Slim | null = null

  // 목록이 있어도 **현재 자산이 그 안에 있을 때만** 쓴다. 타임라인처럼 무한 목록의 일부만
  // 받은 경우 깊이 스크롤해 연 사진이 목록 밖일 수 있는데, 그때 목록만 믿으면 prev/next 가
  // 둘 다 비어 스와이프가 통째로 죽는다 → 전역 이웃으로 되돌아간다. 반대로 앨범·인물·
  // 스토리는 경계가 계약이라 되돌아가지 않는다(이탈 방지). 그래서 호출부가 정한다.
  const hasList = !!args.neighborIds && args.neighborIds.length > 0
  const listIndex = args.neighborIds?.indexOf(asset.id) ?? -1
  const useList = hasList && (listIndex >= 0 || !args.neighborFallbackToGlobal)
  if (args.neighborIds && useList) {
    // 컬렉션 내 이동 — 전역 타임라인과 같은 스와이프 방향을 맞춘다. 전역은 nextId=그리드
    // 상 앞(이전 인덱스)·prevId=그리드상 뒤(다음 인덱스)로 매핑되므로(viewer-image 의
    // 슬라이드 배열 [next,current,prev] 기준), 목록에서도 동일하게: nextId=list[i-1],
    // prevId=list[i+1]. (반대로 하면 좌우 스와이프가 뒤집힌다.)
    const i = listIndex
    const nextId = i > 0 ? args.neighborIds[i - 1] : undefined
    const prevId = i >= 0 && i < args.neighborIds.length - 1 ? args.neighborIds[i + 1] : undefined
    const ids = [prevId, nextId].filter((x): x is string => Boolean(x))
    const rows = ids.length
      ? await prismaMedia.asset.findMany({
          // 전역 경로와 같은 조건 — 아직 못 볼 자산(처리 중·실패)으로 넘어가면 뷰어가
          // 스와이프 없는 안내 화면을 띄워 막다른 길이 된다.
          where: {
            id: { in: ids },
            familyId: args.familyId,
            deletedAt: null,
            status: 'ready',
          },
          select,
        })
      : []
    const byId = new Map(rows.map((r) => [r.id, r]))
    prevAsset = prevId ? (byId.get(prevId) ?? null) : null
    nextAsset = nextId ? (byId.get(nextId) ?? null) : null
  } else {
    // 키셋 이웃: OR 가 정확한 경계이고, 옆의 lte/gte 는 플래너가 인덱스 시작점으로 쓰는
    // 중복 상·하한이다(OR 만으로는 가족 전체를 앞에서부터 훑는다). 의미는 동일.
    ;[prevAsset, nextAsset] =
      args.sort === 'uploaded'
        ? await Promise.all([
            prismaMedia.asset.findFirst({
              where: {
                ...baseWhere,
                createdAt: { lte: asset.createdAt },
                OR: [
                  { createdAt: { lt: asset.createdAt } },
                  { createdAt: asset.createdAt, id: { lt: asset.id } },
                ],
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select,
            }),
            prismaMedia.asset.findFirst({
              where: {
                ...baseWhere,
                createdAt: { gte: asset.createdAt },
                OR: [
                  { createdAt: { gt: asset.createdAt } },
                  { createdAt: asset.createdAt, id: { gt: asset.id } },
                ],
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select,
            }),
          ])
        : await Promise.all([
            prismaMedia.asset.findFirst({
              where: {
                ...baseWhere,
                takenAt: { lte: asset.takenAt },
                OR: [
                  { takenAt: { lt: asset.takenAt } },
                  { takenAt: asset.takenAt, id: { lt: asset.id } },
                ],
              },
              orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
              select,
            }),
            prismaMedia.asset.findFirst({
              where: {
                ...baseWhere,
                takenAt: { gte: asset.takenAt },
                OR: [
                  { takenAt: { gt: asset.takenAt } },
                  { takenAt: asset.takenAt, id: { gt: asset.id } },
                ],
              },
              orderBy: [{ takenAt: 'asc' }, { id: 'asc' }],
              select,
            }),
          ])
  }

  // 인접 두 슬롯은 batch 로 사인 — round-trip 한 번 절약.
  const adjIds = [prevAsset?.id, nextAsset?.id].filter((x): x is string => Boolean(x))
  const adjUrls = adjIds.length ? await media.getAssetUrlsBatch(args.familyId, adjIds) : {}

  function buildSlim(a: Slim | null): AssetSlim | null {
    if (!a) return null
    const u = adjUrls[a.id] ?? null
    return {
      id: a.id,
      publicNo: a.publicNo,
      kind: a.kind,
      status: a.status,
      urls: u,
      videoSrc: a.kind === 'video' ? pickVideoUrl(u) : null,
      posterUrl: pickVideoPosterUrl(u) ?? undefined,
    }
  }

  const current: AssetSlim = {
    id: asset.id,
    publicNo: asset.publicNo,
    kind: asset.kind,
    status: asset.status,
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
