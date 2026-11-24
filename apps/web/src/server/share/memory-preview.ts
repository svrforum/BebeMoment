import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { getStoriesHolding } from './day-preview'
import { type PhotoSetItem, type PhotoSetPreview, buildPhotoSetPreview } from './photo-set'

export type MemoryStoryBlock = {
  id: string
  publicNo: number
  body: string
  /** 링크에 담긴 사진 중 이 스토리의 것 — 스토리에 담은 순서. */
  items: PhotoSetItem[]
}

export type MemoryPreview = {
  /** 링크에 담긴 사진 전부(보이는 것만) — 장수·저장·미리보기 이미지의 기준. */
  photos: PhotoSetPreview
  stories: MemoryStoryBlock[]
  /** 어느 스토리에도 안 담긴 사진. */
  loose: PhotoSetItem[]
}

/**
 * 추억 링크의 공개 프리뷰 — 링크에 고정된 사진 전부와, 그 사진이 담긴 스토리의 글.
 *
 * 사진은 발급 순간의 목록 그대로다(스토리에 같은 날 사진이 더 있어도 링크에 없으면 안 보인다).
 * 스토리도 링크를 만들 때 이미 있던 것만이다(`madeAt`) — 나중에 그 사진으로 쓴 글이 예전에 보낸
 * 링크에 따라 나오면 아무도 내보내기로 정하지 않은 글이 공개된다. 글 내용은 볼 때 읽는다 —
 * 가족 공개 스토리만이고, 보호자 전용으로 바뀐 스토리는 글도 사진도 빠진다(`buildPhotoSetPreview`
 * 가 비밀 스토리 사진을 뺀다). 한 사진이 두 스토리에 있으면 먼저 만든 스토리 쪽에 한 번만 나온다.
 */
export async function buildMemoryPreview(
  assetIds: string[],
  /** 링크를 만든 시각(`share_links.created_at`). */
  madeAt: Date,
  familyId: string,
  baseUrl: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<MemoryPreview | null> {
  const [photos, stories] = await Promise.all([
    buildPhotoSetPreview(assetIds, familyId, baseUrl, prismaPublic, prismaMedia, media),
    getStoriesHolding(assetIds, familyId, prismaPublic, prismaMedia),
  ])
  if (!photos) return null

  const itemById = new Map<string, PhotoSetItem>()
  photos.ids.forEach((id, i) => {
    const item = photos.items[i]
    if (item) itemById.set(id, item)
  })
  const placed = new Set<string>()
  const blocks: MemoryStoryBlock[] = []
  for (const s of stories) {
    if (s.createdAt.getTime() > madeAt.getTime()) continue
    const ids = s.assetIds.filter((id) => itemById.has(id) && !placed.has(id))
    if (ids.length === 0) continue
    for (const id of ids) placed.add(id)
    blocks.push({
      id: s.id,
      publicNo: s.publicNo,
      body: s.body,
      items: ids.flatMap((id) => itemById.get(id) ?? []),
    })
  }
  const loose = photos.ids.flatMap((id) => (placed.has(id) ? [] : (itemById.get(id) ?? [])))
  return { photos, stories: blocks, loose }
}
