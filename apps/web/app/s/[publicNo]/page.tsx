import { prismaMedia, prismaPublic } from '@/lib/db-init'
import { getMediaClient } from '@/lib/media-client'
import { getPublicStoryPreview } from '@/server/share/public-story'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

function publicUrl(): string {
  return (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
}

async function loadPreview(publicNoStr: string) {
  const n = Number(publicNoStr)
  if (!Number.isInteger(n)) return null
  return getPublicStoryPreview(n, prismaPublic, prismaMedia, getMediaClient())
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicNo: string }>
}): Promise<Metadata> {
  const { publicNo } = await params
  const p = await loadPreview(publicNo)
  if (!p) return {} // 루트 레이아웃의 기본 OG 로 폴백(비공개·없음)
  const desc = p.body.replace(/\s+/g, ' ').trim().slice(0, 160) || p.familyName
  const url = `${publicUrl()}/s/${p.publicNo}`
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

export default async function PublicSharePage({
  params,
}: {
  params: Promise<{ publicNo: string }>
}) {
  const { publicNo } = await params
  const p = await loadPreview(publicNo)
  const webUrl = `${publicUrl()}/story/${publicNo}`
  // 앱 딥링크 — 설치돼 있으면 앱(bebe://open)으로, 아니면 web /story 로 폴백(intent://).
  const appHref = `intent://open?server=${encodeURIComponent(publicUrl())}&path=${encodeURIComponent(
    `/story/${publicNo}`,
  )}#Intent;scheme=bebe;package=im.bebe.app;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`

  if (!p) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-base-50 px-6 text-center dark:bg-base-950">
        <p className="text-[15px] text-base-500">비공개이거나 찾을 수 없는 글이에요.</p>
        <a
          href={webUrl}
          className="rounded-full bg-point-500 px-5 py-2.5 text-sm font-semibold text-white"
        >
          앱에서 열기
        </a>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-base-50 px-5 pb-8 pt-[calc(env(safe-area-inset-top)+1.5rem)] dark:bg-base-950">
      <p className="text-[22px] font-bold tracking-tight text-base-900 dark:text-base-50">
        {p.familyName}
      </p>
      <p className="mt-0.5 text-[13px] text-base-500">우리 가족 이야기</p>

      {p.imageUrl && (
        // biome-ignore lint/a11y/useAltText: 공개 프리뷰 대표사진(설명 없음)
        // biome-ignore lint/performance/noImgElement: 공개 랜딩의 단일 signed URL — PictureImage(클라) 불필요
        <img src={p.imageUrl} alt="" className="mt-4 w-full rounded-2xl object-cover shadow-card" />
      )}

      {p.body.trim() && (
        <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-base-800 dark:text-base-200">
          {p.body}
        </p>
      )}

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
          웹에서 열기
        </a>
        <p className="mt-1 text-center text-[12px] text-base-400">
          전체 내용은 가족 구성원만 볼 수 있어요
        </p>
      </div>
    </main>
  )
}
