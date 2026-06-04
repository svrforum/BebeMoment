import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getPublicStoryPreview } from '@/server/share/public-story'
import { resolveShareLink } from '@/server/share/resolve'
import { Lock } from 'lucide-react'
import type { Metadata } from 'next'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

// 크롤러(카톡)·사용자가 실제로 친 도메인 — 리버스 프록시 뒤라 PUBLIC_URL(LAN)이 아니라
// x-forwarded-host 를 써야 og:image/og:url 이 외부에서 동작한다. 폴백: host → PUBLIC_URL.
async function requestBaseUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const envBase = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
  if (!host) return envBase
  const proto = h.get('x-forwarded-proto') ?? (envBase.startsWith('https') ? 'https' : 'http')
  return `${proto}://${host}`
}

// 토큰 → 스토리. 만료·해제·없음은 status 로 구분해 라우트가 안내 문구를 다르게 한다.
// 순번(숫자) 링크는 share_links 에 매칭되는 토큰이 없어 자동으로 notfound 가 된다(순번 차단).
async function load(token: string, baseUrl: string) {
  const r = await resolveShareLink(token, prismaPublic)
  if (r.status !== 'ok') return { status: r.status } as const
  const preview = await getPublicStoryPreview(
    r.storyId,
    baseUrl,
    prismaPublic,
    prismaMedia,
    getMediaClient(),
  )
  if (!preview) return { status: 'notfound' } as const
  return { status: 'ok' as const, preview }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const base = await requestBaseUrl()
  const r = await load(token, base)
  if (r.status !== 'ok') return {} // 만료·없음 → 루트 레이아웃 기본 OG
  const p = r.preview
  const desc = p.body.replace(/\s+/g, ' ').trim().slice(0, 160) || p.familyName
  const url = `${base}/s/${token}`
  const images = p.imageUrl ? [p.imageUrl] : []
  return {
    title: p.familyName,
    description: desc,
    openGraph: {
      title: p.familyName,
      description: desc,
      url,
      siteName: p.familyName,
      type: 'article',
      ...(images.length ? { images: images.map((u) => ({ url: u })) } : {}),
    },
    twitter: {
      card: p.imageUrl ? 'summary_large_image' : 'summary',
      title: p.familyName,
      description: desc,
      ...(images.length ? { images } : {}),
    },
  }
}

function GoneCard({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-base-50 px-6 text-center dark:bg-base-950">
      <p className="text-[17px] font-bold text-base-900 dark:text-base-50">{title}</p>
      <p className="max-w-xs text-[14px] leading-relaxed text-base-500">{body}</p>
    </main>
  )
}

export default async function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const base = await requestBaseUrl()
  const r = await load(token, base)

  if (r.status === 'expired')
    return <GoneCard title="만료된 공유 링크예요" body="공유한 가족에게 새 링크를 요청해주세요." />
  if (r.status === 'revoked')
    return (
      <GoneCard
        title="해제된 공유 링크예요"
        body="이 링크는 더 이상 사용할 수 없어요. 새 링크를 요청해주세요."
      />
    )
  if (r.status !== 'ok')
    return <GoneCard title="찾을 수 없는 링크예요" body="링크가 올바른지 다시 확인해주세요." />

  const p = r.preview
  const webUrl = `${base}/story/${p.publicNo}`
  // 앱 딥링크 — 설치돼 있으면 앱(bebe://open)으로, 아니면 web /story 로 폴백(intent://).
  const appHref = `intent://open?server=${encodeURIComponent(base)}&path=${encodeURIComponent(
    `/story/${p.publicNo}`,
  )}#Intent;scheme=bebe;package=im.bebe.app;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`

  const remaining = p.totalPhotos > 1 ? p.totalPhotos - 1 : 0
  const lockedTiles = ['a', 'b', 'c', 'd'].slice(0, Math.min(remaining, 4))

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-base-50 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+1.25rem)] dark:bg-base-950">
      {/* 헤더 — 가족명(워드마크) + 메타 */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-point-100 text-[15px] font-bold text-point-600 dark:bg-point-500/20 dark:text-point-300">
          {p.familyName.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-bold tracking-tight text-base-900 dark:text-base-50">
            {p.familyName}
          </p>
          <p className="text-[12px] text-base-500">
            우리 가족 이야기{p.totalPhotos > 0 ? ` · 사진 ${p.totalPhotos}장` : ''}
          </p>
        </div>
      </div>

      {/* 공개 1장(커버) */}
      {p.imageUrl && (
        <div className="relative mt-4">
          {/* biome-ignore lint/a11y/useAltText: 공개 대표사진(설명 없음) */}
          {/* biome-ignore lint/performance/noImgElement: 공개 랜딩의 단일 signed URL — PictureImage(클라) 불필요 */}
          <img src={p.imageUrl} alt="" className="w-full rounded-2xl object-cover shadow-card" />
          {p.totalPhotos > 1 && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
              1 / {p.totalPhotos}
            </span>
          )}
        </div>
      )}

      {/* 본문(공개) */}
      {p.body.trim() && (
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-base-800 dark:text-base-200">
          {p.body}
        </p>
      )}

      {/* 잠긴 나머지 사진 — 실제 사진은 노출 안 하고 잠금 타일로 로그인 유도 */}
      {remaining > 0 && (
        <a
          href={webUrl}
          className="mt-5 block rounded-2xl border border-base-200/70 bg-base-0 p-4 transition active:scale-[0.99] dark:border-base-800/70 dark:bg-base-900"
        >
          <div className="grid grid-cols-4 gap-2">
            {lockedTiles.map((k) => (
              <div
                key={k}
                className="flex aspect-square items-center justify-center rounded-lg bg-base-100 dark:bg-base-800"
              >
                <Lock size={15} strokeWidth={2.2} className="text-base-400" />
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[13px] font-medium text-base-700 dark:text-base-200">
            사진 {remaining}장이 더 있어요 · 로그인하면 전체를 볼 수 있어요
          </p>
        </a>
      )}

      {/* CTA */}
      <div className="mt-auto flex flex-col gap-2.5 pt-8">
        <a
          href={appHref}
          className="flex h-12 items-center justify-center rounded-2xl bg-point-500 text-[15px] font-semibold text-white active:scale-[0.99]"
        >
          앱에서 이어보기
        </a>
        <a
          href={webUrl}
          className="flex h-12 items-center justify-center rounded-2xl border border-base-200 bg-base-0 text-[15px] font-semibold text-base-800 active:scale-[0.99] dark:border-base-800 dark:bg-base-900 dark:text-base-100"
        >
          로그인하고 전체 보기
        </a>
        <p className="mt-1 text-center text-[12px] text-base-400">
          가족 구성원만 전체를 볼 수 있어요
        </p>
      </div>
    </main>
  )
}
