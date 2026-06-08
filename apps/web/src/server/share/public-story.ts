import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'
import { listSecretAssetIds } from '../story/secret-assets'

// og:image 는 외부 크롤러(카톡·페북)가 가져가므로 반드시 공개 절대 URL이어야 한다. media 가
// 내부(localhost)·루트-상대 URL 을 줄 수 있어, 경로만 떼어 baseUrl(요청 도메인)로 재절대화.
// baseUrl 은 PUBLIC_URL(LAN일 수 있음)이 아니라 크롤러가 실제로 친 도메인(x-forwarded-host)
// 을 써야 외부에서 받을 수 있다(§17#28, 리버스 프록시 뒤 도메인≠PUBLIC_URL).
export function toAbsolute(u: string | null, baseUrl: string): string | null {
  if (!u) return null
  const base = baseUrl.replace(/\/$/, '')
  if (!base) return u
  if (u.startsWith('/')) return base + u
  try {
    const parsed = new URL(u)
    return base + parsed.pathname + parsed.search
  } catch {
    return u
  }
}

export type PublicStoryPreview = {
  familyName: string
  title: string | null
  body: string
  imageUrl: string | null
  totalPhotos: number
  publicNo: number
}

/**
 * 공유 링크용 공개 스토리 프리뷰(OG 태그·랜딩). 세션/familyId 없는 공개 라우트라 tenant
 * 미들웨어를 raw 쿼리로 우회한다(§8, isRegistrationOpen 과 동일 패턴). storyId 는 공유
 * 토큰 해석(resolveShareLink)에서 받은 UUID. **family-공개(visibility='family') 스토리만**
 * — 발급 후 guardians 전용으로 바뀌면 null(프리뷰 차단, 방어). 대표사진은 story_assets.order
 * 가 가장 앞선 ready 자산. og:image 는 미디어 signed display URL을 그대로 쓴다(JWT 가 URL 에
 * 있어 쿠키 없이 공개 fetch, TTL 10분이라 공유 시점에 유효).
 */
export async function getPublicStoryPreview(
  storyId: string,
  baseUrl: string,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PublicStoryPreview | null> {
  if (!storyId) return null

  const rows = await prismaPublic.$queryRaw<
    {
      id: string
      family_id: string
      public_no: number
      title: string | null
      body: string
      visibility: string
      family_name: string
    }[]
  >`
    SELECT s.id, s.family_id, s.public_no, s.title, s.body, s.visibility::text AS visibility, f.name AS family_name
    FROM stories s JOIN families f ON f.id = s.family_id
    WHERE s.id = ${storyId}::uuid AND s.deleted_at IS NULL
    LIMIT 1
  `
  const row = rows[0]
  if (!row || row.visibility !== 'family') return null

  const assetRows = await prismaPublic.$queryRaw<{ asset_id: string }[]>`
    SELECT asset_id FROM story_assets WHERE entry_id = ${row.id}::uuid ORDER BY "order" ASC
  `
  // 이 스토리가 가족 공개라도, 사진이 다른 비밀 스토리에도 속하면 공개 프리뷰에서 제외(Rule A).
  const secret = new Set(await listSecretAssetIds(prismaPublic, row.family_id))
  const orderedIds = assetRows.map((a) => a.asset_id).filter((id) => !secret.has(id))
  let imageUrl: string | null = null
  let totalPhotos = 0
  if (orderedIds.length) {
    const ready = await prismaMedia.asset.findMany({
      where: { id: { in: orderedIds }, familyId: row.family_id, status: 'ready', deletedAt: null },
      select: { id: true },
    })
    const readySet = new Set(ready.map((a) => a.id))
    totalPhotos = readySet.size
    const firstId = orderedIds.find((id) => readySet.has(id))
    if (firstId) {
      try {
        const urls = await media.getAssetUrls(firstId, row.family_id)
        // og:image 는 jpeg 우선(카톡·페북이 avif/webp 미지원일 수 있음). 요청 도메인 절대 URL.
        imageUrl = toAbsolute(urls.display1080?.jpeg ?? urls.videoPoster ?? null, baseUrl)
      } catch {
        imageUrl = null
      }
    }
  }

  return {
    familyName: row.family_name,
    title: row.title,
    body: row.body,
    imageUrl,
    totalPhotos,
    publicNo: row.public_no,
  }
}
