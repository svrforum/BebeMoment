import { getAuth } from '@/lib/auth'
import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { resolveContext } from '@/server/context'
import { getDateAssetIds } from '@/server/share/date-assets'
import { type PhotoSetPreview, buildPhotoSetPreview } from '@/server/share/photo-set'
import { type PublicAlbumPreview, getPublicAlbumPreview } from '@/server/share/public-album'
import { type PublicStoryPreview, getPublicStoryPreview } from '@/server/share/public-story'
import { pickShareBaseUrl } from '@/lib/share-base-url'
import { clientIp, rateLimit } from '@/server/auth/rate-limit'
import { resolveShareLink } from '@/server/share/resolve'
import { isFeatureEnabled } from '@/server/settings/features'
import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import { AlbumShareView } from './album-view'
import { PhotoSetShareView } from './photo-set-view'
import { GoneCard } from './share-frame'
import { StoryShareView } from './story-view'

export const dynamic = 'force-dynamic'

async function requestBaseUrl(): Promise<string> {
  const h = await headers()
  // x-forwarded-host 는 클라가 위조 가능 — PUBLIC_URL(또는 SHARE_ALLOWED_HOSTS) 호스트와
  // 일치할 때만 신뢰하고, 아니면 PUBLIC_URL 로 폴백한다.
  const allowedHosts = (process.env.SHARE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return pickShareBaseUrl({
    host: h.get('x-forwarded-host') ?? h.get('host'),
    proto: h.get('x-forwarded-proto'),
    publicUrl: process.env.PUBLIC_URL,
    allowedHosts,
  })
}

type PhotoSet = { preview: PhotoSetPreview; ids: string[]; meta: string }
type Loaded =
  | { status: 'ok'; kind: 'story'; preview: PublicStoryPreview }
  | { status: 'ok'; kind: 'album'; preview: PublicAlbumPreview }
  | { status: 'ok'; kind: 'photoset'; familyId: string; set: PhotoSet }
  | { status: 'expired' | 'revoked' | 'notfound' }

async function load(token: string, base: string): Promise<Loaded> {
  // 무인증 공개 라우트 — IP 당 레이트리밋으로 토큰 추측·스크래핑(매 히트 DB+미디어 호출)
  // 폭주를 막는다. 정상 열람엔 넉넉(분당 120, 페이지+OG 2히트라 ≈60뷰/분/IP).
  const ip = clientIp({ headers: await headers() } as unknown as Request)
  if (!(await rateLimit(`share:${ip}`, 120, 60)).ok) return { status: 'notfound' }
  // 공유 기능 OFF 면 기존 링크도 더 이상 열리지 않는다(관리자 kill-switch).
  if (!(await isFeatureEnabled('share', prismaPublic))) return { status: 'notfound' }
  const r = await resolveShareLink(token, prismaPublic)
  if (r.status !== 'ok') return { status: r.status }
  const media = getMediaClient()

  if (r.target.kind === 'story') {
    const preview = await getPublicStoryPreview(
      r.target.storyId,
      base,
      prismaPublic,
      prismaMedia,
      media,
    )
    return preview ? { status: 'ok', kind: 'story', preview } : { status: 'notfound' }
  }
  if (r.target.kind === 'album') {
    const preview = await getPublicAlbumPreview(
      r.target.albumId,
      r.familyId,
      base,
      prismaPublic,
      prismaMedia,
      media,
    )
    return preview ? { status: 'ok', kind: 'album', preview } : { status: 'notfound' }
  }

  // asset(1장)·selection(N장)·date(그 날) — 전부 "사진 집합" 한 뷰로.
  const t = await getTranslations('share')
  const locale = await getLocale()
  let ids: string[]
  let meta: string
  if (r.target.kind === 'asset') {
    ids = [r.target.assetId]
    meta = t('photoset.metaFamilyPhoto')
  } else if (r.target.kind === 'selection') {
    ids = r.target.assetIds
    meta = t('photoset.metaCount', { n: ids.length })
  } else {
    // 날짜 공유는 발급 시점에 존재하던 사진만 — 이후 같은 날 업로드는 자동 포함하지 않는다.
    ids = await getDateAssetIds(r.target.date, r.familyId, prismaMedia, r.createdAt)
    const monthDay = new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
    meta = t('photoset.metaDateCount', {
      date: monthDay.format(new Date(`${r.target.date}T00:00:00.000Z`)),
      n: ids.length,
    })
  }
  const preview = await buildPhotoSetPreview(
    ids,
    r.familyId,
    base,
    prismaPublic,
    prismaMedia,
    media,
  )
  if (!preview || preview.total === 0) return { status: 'notfound' }
  return {
    status: 'ok',
    kind: 'photoset',
    familyId: r.familyId,
    set: { preview, ids: preview.ids, meta },
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const base = await requestBaseUrl()
  const r = await load(token, base)
  if (r.status !== 'ok') return {}

  const familyName = r.kind === 'photoset' ? r.set.preview.familyName : r.preview.familyName
  const imageUrl =
    r.kind === 'story' || r.kind === 'album'
      ? r.preview.imageUrl
      : (r.set.preview.items[0]?.displayUrl ?? null)
  const desc =
    r.kind === 'story'
      ? r.preview.body.replace(/\s+/g, ' ').trim().slice(0, 160) || familyName
      : r.kind === 'album'
        ? r.preview.name
        : familyName
  const images = imageUrl ? [imageUrl] : []
  return {
    title: familyName,
    description: desc,
    openGraph: {
      title: familyName,
      description: desc,
      url: `${base}/s/${token}`,
      siteName: familyName,
      type: 'article',
      ...(images.length ? { images: images.map((u) => ({ url: u })) } : {}),
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title: familyName,
      description: desc,
      ...(images.length ? { images } : {}),
    },
  }
}

// 로그인한 가족 구성원인지 — 원본 다운로드는 로그인+같은 가족만(서버 라우트도 401 로 강제).
async function viewerFamilyId(): Promise<string | null> {
  const { session } = await getAuth()
  if (!session) return null
  const ctx = await resolveContext(
    { userId: session.userId, currentFamilyId: session.currentFamilyId ?? null },
    prismaPublic,
  )
  return ctx.family?.id ?? null
}

export default async function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const base = await requestBaseUrl()
  const r = await load(token, base)
  const t = await getTranslations('share')

  if (r.status === 'expired')
    return <GoneCard title={t('gone.expiredTitle')} body={t('gone.expiredBody')} />
  if (r.status === 'revoked')
    return <GoneCard title={t('gone.revokedTitle')} body={t('gone.revokedBody')} />
  if (r.status !== 'ok')
    return <GoneCard title={t('gone.notfoundTitle')} body={t('gone.notfoundBody')} />

  if (r.kind === 'story') return <StoryShareView p={r.preview} base={base} />
  if (r.kind === 'album') return <AlbumShareView p={r.preview} base={base} />

  const canDownload = (await viewerFamilyId()) === r.familyId
  const loginHref = `${base}/login?next=${encodeURIComponent(`/s/${token}`)}`
  return (
    <PhotoSetShareView
      p={r.set.preview}
      meta={r.set.meta}
      canDownload={canDownload}
      downloadIds={r.set.ids}
      loginHref={loginHref}
    />
  )
}
