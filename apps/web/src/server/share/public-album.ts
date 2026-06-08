import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { listSecretAssetIds } from '../story/secret-assets'
import { toAbsolute } from './public-story'

export type PublicAlbumPreview = {
  familyName: string
  name: string
  imageUrl: string | null
  photoCount: number
  albumId: string
}

/**
 * 공유 링크용 공개 앨범 프리뷰(OG 태그·랜딩). 무인증 라우트라 prismaPublic raw(tenant 우회,
 * §8)로 앨범·가족명·표지·사진수를 조회한다. **비밀(secret)·삭제 앨범은 null**(발급 후
 * 비밀 전환 시 차단, 방어). 표지는 cover_asset_id, 없으면 sort_index 가장 앞 자산. og:image 는
 * media display jpeg signed URL 을 요청 도메인 절대 URL 로.
 */
export async function getPublicAlbumPreview(
  albumId: string,
  familyId: string,
  baseUrl: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PublicAlbumPreview | null> {
  if (!albumId) return null

  const rows = await prismaPublic.$queryRaw<
    { name: string; cover_asset_id: string | null; family_name: string }[]
  >`
    SELECT a.name, a.cover_asset_id, f.name AS family_name
    FROM albums a JOIN families f ON f.id = a.family_id
    WHERE a.id = ${albumId}::uuid AND a.family_id = ${familyId}::uuid
      AND a.deleted_at IS NULL AND a.is_secret = false
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null

  // 비밀 스토리에 속한 사진은 공개 앨범 프리뷰의 표지·장수에서도 제외한다.
  const secret = await listSecretAssetIds(prismaPublic, familyId)
  const secretSet = new Set(secret)

  const countRows = await prismaPublic.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM album_assets WHERE album_id = ${albumId}::uuid
  `
  let photoCount = Number(countRows[0]?.n ?? 0)
  if (secret.length) {
    const secretInAlbum = await prismaPublic.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM album_assets
      WHERE album_id = ${albumId}::uuid AND asset_id = ANY(${secret}::uuid[])
    `
    photoCount -= Number(secretInAlbum[0]?.n ?? 0)
  }

  let coverId = row.cover_asset_id && !secretSet.has(row.cover_asset_id) ? row.cover_asset_id : null
  if (!coverId) {
    const firstRows = secret.length
      ? await prismaPublic.$queryRaw<{ asset_id: string }[]>`
          SELECT asset_id FROM album_assets
          WHERE album_id = ${albumId}::uuid AND asset_id <> ALL(${secret}::uuid[])
          ORDER BY sort_index ASC, added_at ASC LIMIT 1
        `
      : await prismaPublic.$queryRaw<{ asset_id: string }[]>`
          SELECT asset_id FROM album_assets WHERE album_id = ${albumId}::uuid
          ORDER BY sort_index ASC, added_at ASC LIMIT 1
        `
    coverId = firstRows[0]?.asset_id ?? null
  }

  let imageUrl: string | null = null
  if (coverId) {
    try {
      const urls = await media.getAssetUrls(coverId, familyId)
      imageUrl = toAbsolute(urls.display1080?.jpeg ?? urls.videoPoster ?? null, baseUrl)
    } catch {
      imageUrl = null
    }
  }

  return { familyName: row.family_name, name: row.name, imageUrl, photoCount, albumId }
}
