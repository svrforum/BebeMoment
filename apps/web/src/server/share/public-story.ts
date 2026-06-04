import type { PrismaClient as PrismaMedia } from '@bebe/db-media'
import type { PrismaClient as PrismaPublic } from '@bebe/db-public'
import type { MediaClient } from '@bebe/media-client'

// og:image 는 외부 크롤러(카톡·페북)가 가져가므로 반드시 공개 절대 URL(PUBLIC_URL)이어야
// 한다. media 가 내부(localhost) 또는 루트-상대 URL 을 줄 수 있어, 경로만 떼어 PUBLIC_URL
// 로 다시 절대화한다(§17#28).
function toPublicAbsolute(u: string | null): string | null {
  if (!u) return null
  const base = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
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
  publicNo: number
}

/**
 * 공유 링크용 공개 스토리 프리뷰(OG 태그·랜딩). 세션/familyId 없는 공개 라우트라 tenant
 * 미들웨어를 raw 쿼리로 우회한다(§8, isRegistrationOpen 과 동일 패턴). **family-공개
 * (visibility='family') 스토리만** — guardians 전용은 null(프리뷰 없음). 대표사진은
 * story_assets.order 가 가장 앞선 ready 자산. og:image 는 미디어 signed display URL을
 * 그대로 쓴다(JWT 가 URL 에 있어 쿠키 없이 공개 fetch, TTL 10분이라 공유 시점에 유효).
 */
export async function getPublicStoryPreview(
  publicNo: number,
  prismaPublic: PrismaPublic,
  prismaMedia: PrismaMedia,
  media: MediaClient,
): Promise<PublicStoryPreview | null> {
  if (!Number.isInteger(publicNo) || publicNo <= 0) return null

  const rows = await prismaPublic.$queryRaw<
    {
      id: string
      family_id: string
      title: string | null
      body: string
      visibility: string
      family_name: string
    }[]
  >`
    SELECT s.id, s.family_id, s.title, s.body, s.visibility::text AS visibility, f.name AS family_name
    FROM stories s JOIN families f ON f.id = s.family_id
    WHERE s.public_no = ${publicNo} AND s.deleted_at IS NULL
    LIMIT 1
  `
  const row = rows[0]
  if (!row || row.visibility !== 'family') return null

  const assetRows = await prismaPublic.$queryRaw<{ asset_id: string }[]>`
    SELECT asset_id FROM story_assets WHERE entry_id = ${row.id}::uuid ORDER BY "order" ASC
  `
  const orderedIds = assetRows.map((a) => a.asset_id)
  let imageUrl: string | null = null
  if (orderedIds.length) {
    const ready = await prismaMedia.asset.findMany({
      where: { id: { in: orderedIds }, familyId: row.family_id, status: 'ready', deletedAt: null },
      select: { id: true },
    })
    const readySet = new Set(ready.map((a) => a.id))
    const firstId = orderedIds.find((id) => readySet.has(id))
    if (firstId) {
      try {
        const urls = await media.getAssetUrls(firstId, row.family_id)
        // og:image 는 jpeg 우선(카톡·페북이 avif/webp 미지원일 수 있음). 공개 절대 URL 로.
        imageUrl = toPublicAbsolute(urls.display1080?.jpeg ?? urls.videoPoster ?? null)
      } catch {
        imageUrl = null
      }
    }
  }

  return { familyName: row.family_name, title: row.title, body: row.body, imageUrl, publicNo }
}
