import { likersForAsset } from '@/server/like/list-for-asset'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'

type AssetRow = NonNullable<Awaited<ReturnType<PrismaMedia['asset']['findFirst']>>>
type Likers = Awaited<ReturnType<typeof likersForAsset>>

export type ViewerDetail = {
  asset: AssetRow
  likers: Likers
  liked: boolean
  bookmarked: boolean
  inWidget: boolean
  babies: { id: string; name: string }[]
}

/**
 * 상세 화면이 사진 한 장에 대해 필요로 하는 것 — 자산 행 + 보는 사람의 반응 상태 + 연결된 아기.
 *
 * 서버 렌더(`/detail/[id]`)와 스와이프용 API(`/api/asset/[id]/viewer-bundle`)가 같은 것을 보여주므로
 * 한 곳에 둔다. 둘이 각자 조립하던 시절엔 한쪽에만 필드를 추가하는 일이 실제로 있었다
 * (위젯 담김 여부가 API 에서 빠져 스와이프 후 메뉴가 반대로 동작했다).
 *
 * 댓글은 소비자마다 필요한 모양이 달라(상세는 목록, API 는 개수) 여기서 다루지 않는다.
 */
export async function loadViewerDetail(
  args: { assetId: string; familyId: string; userId: string },
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
): Promise<ViewerDetail | null> {
  const { assetId, familyId, userId } = args
  const asset = await prismaMedia.asset.findFirst({
    where: { id: assetId, familyId, deletedAt: null },
  })
  if (!asset) return null

  const [likers, myLike, myBookmark, myWidgetPhoto, assetBabyLinks] = await Promise.all([
    likersForAsset(familyId, asset.id, prismaPublic),
    prismaPublic.assetLike.findFirst({ where: { assetId: asset.id, userId, familyId } }),
    prismaPublic.assetBookmark.findFirst({ where: { assetId: asset.id, userId, familyId } }),
    prismaPublic.widgetPhoto.findFirst({ where: { assetId: asset.id, userId, familyId } }),
    prismaMedia.assetBaby.findMany({ where: { assetId: asset.id }, select: { babyId: true } }),
  ])

  const babyIds = assetBabyLinks.map((l) => l.babyId)
  const babyRows = babyIds.length
    ? await prismaPublic.baby.findMany({
        where: { id: { in: babyIds }, familyId },
        select: { id: true, name: true },
      })
    : []

  return {
    asset,
    likers,
    liked: !!myLike,
    bookmarked: !!myBookmark,
    inWidget: !!myWidgetPhoto,
    babies: babyRows.map((b) => ({ id: b.id, name: b.name })),
  }
}
