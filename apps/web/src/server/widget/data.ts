import { pickDisplayUrl } from '@/lib/asset-url'
import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

export type WidgetData = {
  hasPhoto: boolean
  photoUrl: string | null
  babyName: string | null
  birthDate: string | null
}

/**
 * 위젯이 보여줄 데이터 — 사용자의 현재 가족 최신 사진(display URL) + 가장 먼저 태어난
 * 아기의 이름·생일. 멤버십이 없으면 null(토큰은 유효하나 가족 미해석). 사진이 없으면
 * hasPhoto=false. 서명 URL TTL 10분이라 위젯은 받은 즉시 다운로드해야 한다.
 */
export async function getWidgetData(
  userId: string,
  prismaMedia: PrismaMedia,
  prismaPublic: PrismaPublic,
  media: MediaClient,
): Promise<WidgetData | null> {
  const membership = await prismaPublic.membership.findFirst({
    where: { userId, deletedAt: null },
    select: { familyId: true },
  })
  if (!membership) return null
  const familyId = membership.familyId

  const [asset, baby] = await Promise.all([
    prismaMedia.asset.findFirst({
      where: { familyId, status: 'ready', deletedAt: null, duplicateOf: null },
      orderBy: [{ takenAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    }),
    prismaPublic.baby.findFirst({
      where: { familyId, deletedAt: null },
      orderBy: { birthDate: 'asc' },
      select: { name: true, birthDate: true },
    }),
  ])

  let photoUrl: string | null = null
  if (asset) {
    const urls = await media.getAssetUrls(asset.id, familyId)
    photoUrl = pickDisplayUrl(urls)
  }

  return {
    hasPhoto: Boolean(asset),
    photoUrl,
    babyName: baby?.name ?? null,
    birthDate: baby ? baby.birthDate.toISOString().slice(0, 10) : null,
  }
}
