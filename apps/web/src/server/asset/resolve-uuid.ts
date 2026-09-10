import type { PrismaClient as PrismaMedia } from '@bebe/db-media'

/**
 * 상세 URL 은 순번(`/detail/3`)이고 내부 참조는 UUID 다. 이웃 해석은 UUID 가 필요하므로
 * 숫자로 들어오면 한 번 바꿔 준다(순번은 unique 인덱스라 싸다). 이미 UUID 면 그대로.
 */
export async function resolveAssetUuid(
  ref: string,
  familyId: string,
  prismaMedia: PrismaMedia,
): Promise<string | undefined> {
  if (!/^\d+$/.test(ref)) return ref
  const row = await prismaMedia.asset.findFirst({
    where: { publicNo: Number(ref), familyId, deletedAt: null },
    select: { id: true },
  })
  return row?.id
}
