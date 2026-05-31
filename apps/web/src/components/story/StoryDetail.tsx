'use client'
import { PictureImage } from '@/components/ui/picture-image'
import {
  pickBlurhash,
  pickDisplayTrio,
  pickDisplayUrl,
  pickThumbTrio,
  pickThumbUrl,
} from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/types'
import type { Baby, Story, StoryAsset } from '@bebe/db-public'
import { useFamilySSE } from '@/lib/sse'
import { LayoutGrid, ShieldCheck, Square } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/pagination'
import { MOODS, isMood } from './mood'

// react-markdown + rehype-sanitize together are ~80KB and only mount when
// a diary detail page opens. Code-split out of the main bundle.
const MarkdownBody = dynamic(() => import('./markdown-body'), { ssr: false })

type Entry = Story & {
  assets: (StoryAsset & { asset: AssetWithUrls | null })[]
  baby: Baby | null
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function StoryDetail({ entry }: { entry: Entry }) {
  const mood = isMood(entry.mood) ? MOODS[entry.mood] : null
  const sortedAssets = [...entry.assets]
    .sort((a, b) => a.order - b.order)
    .filter((a) => a.asset !== null)
  const d = entry.entryDate
  const day = DAYS[d.getDay()] ?? ''
  const trimmed = entry.body.trim()
  const [activeIdx, setActiveIdx] = useState(0)

  // 사진 보기 모드: 슬라이드(캐러셀) ↔ 격자(갤러리). 마지막 선택을 localStorage 에 기억.
  const [view, setView] = useState<'slide' | 'grid'>('slide')
  useEffect(() => {
    try {
      const v = localStorage.getItem('bebe.story.photoView')
      if (v === 'grid' || v === 'slide') setView(v)
    } catch {}
  }, [])
  const chooseView = useCallback((v: 'slide' | 'grid') => {
    setView(v)
    try {
      localStorage.setItem('bebe.story.photoView', v)
    } catch {}
  }, [])

  // 편집에서 막 추가한 사진은 저장 시점에 아직 처리 중(urls=null)이라 빈 슬라이드로 보인다.
  // 가족 SSE 로 해당 사진이 ready 가 되면 자동 새로고침해 채운다(타임라인 그리드와 동일 패턴)
  // — 사용자가 수동 새로고침할 필요 없이 추가한 사진이 뷰에 나타난다.
  const router = useRouter()
  const hasPending = entry.assets.some((a) => a.asset !== null && a.asset.urls === null)
  useFamilySSE(
    useCallback(
      (event) => {
        if (!hasPending) return
        if (
          event.type === 'asset.updated' &&
          (event.status === 'ready' || event.status === 'failed')
        ) {
          router.refresh()
        }
      },
      [hasPending, router],
    ),
  )

  // 인스타식 아바타 — 아기 이름의 첫 글자를 point 컬러 그라데이션 원에. 아기가 없으면
  // bullet 점. 추후 아기 프로필 사진이 생기면 여기서 보여줄 수 있음.
  const initial = entry.baby?.name?.charAt(0) ?? '·'
  const dateLabel = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

  // 모델 B — 스토리 사진은 여러 날에 걸칠 수 있다. 올린 날짜 아래에 "사진 N장 ·
  // 언제~언제"를 깔끔하게(takenAt 의 UTC 일자 기준).
  const photoCount = sortedAssets.length
  const takenDates = sortedAssets
    .flatMap((a) => (a.asset?.takenAt ? [a.asset.takenAt] : []))
    .sort((a, b) => a.getTime() - b.getTime())
  const fmtMD = (x: Date): string => `${x.getUTCMonth() + 1}월 ${x.getUTCDate()}일`
  const dayKeyOf = (x: Date): string => `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`
  const firstTaken = takenDates[0] ?? null
  const lastTaken = takenDates[takenDates.length - 1] ?? null
  const rangeLabel =
    firstTaken && lastTaken
      ? dayKeyOf(firstTaken) === dayKeyOf(lastTaken)
        ? fmtMD(firstTaken)
        : `${fmtMD(firstTaken)} – ${fmtMD(lastTaken)}`
      : null
  const photoMeta =
    photoCount > 0
      ? rangeLabel
        ? `사진 ${photoCount}장 · ${rangeLabel}`
        : `사진 ${photoCount}장`
      : null

  return (
    <article className="overflow-hidden rounded-3xl border border-base-200 bg-base-0 shadow-card dark:border-base-800 dark:bg-base-900">
      {/* 헤더 — 아바타 · 이름 · 날짜 · 공개범위 칩. 인스타 포스트 상단과 동일한 운율. */}
      <header className="flex items-center gap-3 px-4 py-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-point-500/25 to-point-600/10 text-[15px] font-bold tracking-tight text-point-600 dark:from-point-500/30 dark:to-point-600/15 dark:text-point-300"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold tracking-tight text-base-900 dark:text-base-50">
            {entry.baby?.name ?? '스토리'}
          </div>
          <div className="text-[12px] tabular-nums text-base-500 dark:text-base-400">
            {dateLabel} · {day}요일
          </div>
          {photoMeta && (
            <div className="mt-0.5 text-[11px] tabular-nums text-base-400 dark:text-base-500">
              {photoMeta}
            </div>
          )}
        </div>
        {entry.visibility === 'guardians' && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-point-500/15 px-2 py-1 text-[11px] font-semibold text-point-600 dark:text-point-400">
            <ShieldCheck size={11} strokeWidth={2.4} />
            보호자만
          </span>
        )}
      </header>

      {/* 사진 — 슬라이드(인스타식 캐러셀) 또는 격자(갤러리) 토글. 여러 장일 때만 토글 노출.
          격자에서 탭하면 전체화면 뷰어(/detail/<publicNo>)로 연다. */}
      {sortedAssets.length > 0 && (
        <div className="relative bg-base-100 dark:bg-base-950">
          {sortedAssets.length > 1 && (
            <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-0.5 rounded-full bg-black/55 p-0.5 backdrop-blur-sm">
              <button
                type="button"
                aria-label="슬라이드 보기"
                aria-pressed={view === 'slide'}
                onClick={() => chooseView('slide')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${view === 'slide' ? 'bg-white/90 text-black' : 'text-white'}`}
              >
                <Square size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                aria-label="격자 보기"
                aria-pressed={view === 'grid'}
                onClick={() => chooseView('grid')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${view === 'grid' ? 'bg-white/90 text-black' : 'text-white'}`}
              >
                <LayoutGrid size={14} strokeWidth={2.2} />
              </button>
            </div>
          )}

          {view === 'slide' ? (
            <>
              <Swiper
                modules={[Pagination]}
                pagination={sortedAssets.length > 1 ? { clickable: true } : false}
                spaceBetween={0}
                slidesPerView={1}
                onSlideChange={(s) => setActiveIdx(s.activeIndex)}
                className="story-carousel aspect-square w-full"
              >
                {sortedAssets.map((link) => {
                  const trio = pickDisplayTrio(link.asset?.urls ?? null)
                  const fallbackUrl = pickDisplayUrl(link.asset?.urls ?? null)
                  return (
                    <SwiperSlide
                      key={link.assetId}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {/* 탭하면 격자와 동일하게 전체화면 뷰어로. 스와이프(드래그)는
                          Swiper 가 클릭과 구분해 처리하므로 슬라이드 넘김은 그대로. */}
                      <Link
                        href={`/detail/${link.asset?.publicNo}`}
                        className="flex aspect-square w-full items-center justify-center"
                      >
                        <PictureImage
                          trio={trio}
                          fallbackUrl={fallbackUrl}
                          alt=""
                          dominantColor={link.asset?.urls?.dominantColor ?? null}
                          blurhash={pickBlurhash(link.asset?.urls ?? null)}
                          aspectRatio={1}
                          className="aspect-square w-full"
                          objectFit="cover"
                          loading="eager"
                          fade={false}
                        />
                      </Link>
                    </SwiperSlide>
                  )
                })}
              </Swiper>
              {sortedAssets.length > 1 && (
                <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm">
                  {activeIdx + 1}/{sortedAssets.length}
                </span>
              )}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">
              {sortedAssets.map((link) => (
                <Link
                  key={link.assetId}
                  href={`/detail/${link.asset?.publicNo}`}
                  className="block aspect-square"
                >
                  <PictureImage
                    trio={pickThumbTrio(link.asset?.urls ?? null)}
                    fallbackUrl={pickThumbUrl(link.asset?.urls ?? null)}
                    alt=""
                    dominantColor={link.asset?.urls?.dominantColor ?? null}
                    blurhash={pickBlurhash(link.asset?.urls ?? null)}
                    aspectRatio={1}
                    className="aspect-square w-full"
                    objectFit="cover"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 캡션 — 무드 칩 → 제목(있다면) → 본문. 인스타 캡션처럼 좌측 정렬, 적당히 빽빽한 줄 간격. */}
      <div className="px-4 pt-3 pb-5">
        {mood && (
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${mood.chip}`}
            >
              <span className="text-[13px] leading-none">{mood.emoji}</span>
              {mood.label}
            </span>
          </div>
        )}

        {entry.title && (
          <h1 className="mb-1.5 text-[17px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
            {entry.title}
          </h1>
        )}

        {trimmed.length > 0 && (
          <div className="prose prose-base max-w-none text-[15px] leading-[1.65] text-base-800 dark:text-base-200">
            <MarkdownBody body={entry.body} />
          </div>
        )}
      </div>
    </article>
  )
}
