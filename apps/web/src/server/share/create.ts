import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient } from '@bebe/db-public'
import { type ShareTtl, expiryFromTtl, generateShareToken } from './token'

export type ShareTarget =
  | { kind: 'story'; storyId: string }
  | { kind: 'asset'; assetId: string }
  | { kind: 'album'; albumId: string }
  | { kind: 'selection'; assetIds: string[] }
  | { kind: 'date'; date: string } // 'YYYY-MM-DD'

const SELECTION_MAX = 100

/**
 * 공유 링크 발급(스토리·단일 사진·앨범·여러 장 선택·날짜). 매 호출마다 새 난수 토큰. 스토리는
 * family-공개만, 사진은 ready 가족 자산만, 앨범은 비밀·삭제 제외. 선택은 ready 가족 자산 N장을
 * share_link_assets 자식 row 로(단일 컬럼 모두 null), 날짜는 target_date 로(동적 — 검증 없음).
 * asset 검증은 media 스키마라 prismaMedia 로, 나머지·insert 는 prismaPublic 로.
 */
export async function createShareLink(
  input: { target: ShareTarget; familyId: string; userId: string; ttl: ShareTtl },
  prismaPublic: PrismaClient,
  prismaMedia: PrismaMedia,
): Promise<{ token: string; expiresAt: Date | null }> {
  const t = input.target
  let validAssetIds: string[] = []

  if (t.kind === 'story') {
    const story = await prismaPublic.story.findFirst({
      where: { id: t.storyId, familyId: input.familyId, deletedAt: null },
      select: { id: true, visibility: true },
    })
    if (!story) throw new Error('스토리를 찾을 수 없어요')
    if (story.visibility !== 'family')
      throw new Error('가족 전체 공개 스토리만 공유 링크를 만들 수 있어요')
  } else if (t.kind === 'asset') {
    const asset = await prismaMedia.asset.findFirst({
      where: { id: t.assetId, familyId: input.familyId, status: 'ready', deletedAt: null },
      select: { id: true },
    })
    if (!asset) throw new Error('사진을 찾을 수 없어요')
  } else if (t.kind === 'album') {
    const album = await prismaPublic.album.findFirst({
      where: { id: t.albumId, familyId: input.familyId, deletedAt: null },
      select: { id: true, secret: true },
    })
    if (!album) throw new Error('앨범을 찾을 수 없어요')
    if (album.secret) throw new Error('비밀 앨범은 공유 링크를 만들 수 없어요')
  } else if (t.kind === 'selection') {
    if (t.assetIds.length === 0) throw new Error('공유할 사진을 선택해주세요')
    if (t.assetIds.length > SELECTION_MAX)
      throw new Error(`한 번에 ${SELECTION_MAX}장까지 공유할 수 있어요`)
    const rows = await prismaMedia.asset.findMany({
      where: { id: { in: t.assetIds }, familyId: input.familyId, status: 'ready', deletedAt: null },
      select: { id: true },
    })
    const ok = new Set(rows.map((r) => r.id))
    validAssetIds = t.assetIds.filter((id) => ok.has(id))
    if (validAssetIds.length === 0) throw new Error('공유할 사진을 찾을 수 없어요')
  }

  const token = generateShareToken()
  const expiresAt = expiryFromTtl(input.ttl, new Date())
  await prismaPublic.shareLink.create({
    data: {
      token,
      familyId: input.familyId,
      createdByUserId: input.userId,
      expiresAt,
      storyId: t.kind === 'story' ? t.storyId : null,
      assetId: t.kind === 'asset' ? t.assetId : null,
      albumId: t.kind === 'album' ? t.albumId : null,
      targetDate: t.kind === 'date' ? new Date(`${t.date}T00:00:00.000Z`) : null,
    },
  })

  if (t.kind === 'selection') {
    await prismaPublic.$executeRaw`
      INSERT INTO share_link_assets (token, asset_id, sort_index)
      SELECT ${token}, a.id, a.ord::int
      FROM unnest(${validAssetIds}::uuid[]) WITH ORDINALITY AS a(id, ord)
    `
  }

  return { token, expiresAt }
}
