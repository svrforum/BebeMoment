import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { toAbsolute } from './public-story'

// 주의: 공개 프리뷰에는 원본(다운로드) URL 을 절대 넣지 않는다 — 익명 클라이언트로
// 직렬화되면 원본이 새어나간다. 저장은 로그인 게이트의 BulkDownloadButton(asset id)으로만.
export type PhotoSetItem = {
  displayUrl: string | null
  isVideo: boolean
}

export type PhotoSetPreview = {
  familyName: string
  items: PhotoSetItem[]
  total: number
  ids: string[]
}

const DISPLAY_CAP = 30

// 여러 장(선택·날짜) 공유의 공개 프리뷰. 그리드로 보여주고 각 사진을 바로 저장(download)할 수
// 있게 display(보기) + original(저장) URL 을 함께 준다. assetIds 순서를 유지하되 ready·미삭제
// 가족 자산만. total 은 전체 개수, items 는 표시 상한(DISPLAY_CAP)까지.
export async function buildPhotoSetPreview(
  assetIds: string[],
  familyId: string,
  baseUrl: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PhotoSetPreview | null> {
  const famRows = await prismaPublic.$queryRaw<{ name: string }[]>`
    SELECT name FROM families WHERE id = ${familyId}::uuid LIMIT 1
  `
  const familyName = famRows[0]?.name
  if (!familyName) return null

  if (assetIds.length === 0) return { familyName, items: [], total: 0, ids: [] }

  const ready = await prismaMedia.asset.findMany({
    where: { id: { in: assetIds }, familyId, status: 'ready', deletedAt: null },
    select: { id: true, kind: true },
  })
  const kindById = new Map(ready.map((a) => [a.id, a.kind]))
  const ordered = assetIds.filter((id) => kindById.has(id))
  const total = ordered.length
  const shown = ordered.slice(0, DISPLAY_CAP)

  let urlsById: Record<string, Awaited<ReturnType<MediaClient['getAssetUrls']>>> = {}
  try {
    urlsById = await media.getAssetUrlsBatch(familyId, shown)
  } catch {
    urlsById = {}
  }

  const items: PhotoSetItem[] = shown.map((id) => {
    const u = urlsById[id]
    const displayUrl = toAbsolute(u?.display1080?.jpeg ?? u?.videoPoster ?? null, baseUrl)
    return { displayUrl, isVideo: kindById.get(id) === 'video' }
  })

  return { familyName, items, total, ids: ordered }
}
