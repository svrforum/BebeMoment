'use client'
import { PictureImage } from '@/components/ui/picture-image'
import {
  pickBlurhash,
  pickDisplayTrio,
  pickDisplayUrl,
  pickThumbTrio,
  pickThumbUrl,
  pickVideoPosterUrl,
} from '@/lib/asset-url'
import type { AssetWithUrls } from '@/server/asset/types'
import type { Baby, Story, StoryAsset } from '@bebe/db-public'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import { LayoutGrid, Play, ShieldCheck, Square } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/pagination'
import { MOODS, isMood } from './mood'

type Entry = Story & {
  assets: (StoryAsset & { asset: AssetWithUrls | null })[]
  baby: Baby | null
}

// 영상 썸네일/포스터 위 중앙 재생 아이콘 — 영상임을 알리고 탭(→ 전체화면 뷰어에서
// 클릭 재생)을 유도. 자동재생은 안 한다.
function VideoPlayOverlay({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const box = size === 'lg' ? 'h-14 w-14' : 'h-8 w-8'
  const icon = size === 'lg' ? 24 : 15
  return (
    <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span
        className={`flex items-center justify-center rounded-full bg-black/45 ring-1 ring-white/30 backdrop-blur-sm ${box}`}
      >
        <Play size={icon} className="ml-0.5 fill-white text-white" strokeWidth={0} />
      </span>
    </span>
  )
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export function StoryDetail({ entry }: { entry: Entry }) {
  const t = useTranslations('story')
  const mood = isMood(entry.mood) ? MOODS[entry.mood] : null
  const sortedAssets = [...entry.assets]
    .sort((a, b) => a.order - b.order)
    .filter((a) => a.asset !== null)
  const d = entry.entryDate
  const weekdayKey = WEEKDAY_KEYS[d.getDay()] ?? 'sun'
  const day = t(`detail.weekday.${weekdayKey}`)
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
    setActiveIdx(0) // 격자↔슬라이드 토글 시 Swiper 가 슬라이드 0 으로 재마운트 → 카운터도 리셋.
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

  // 아바타 — 아기 이름의 첫 글자를 point 컬러 그라데이션 원에. 아기가 없으면
  // bullet 점. 추후 아기 프로필 사진이 생기면 여기서 보여줄 수 있음.
  const initial = entry.baby?.name?.charAt(0) ?? '·'
  const dateLabel = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`

  // 모델 B — 스토리 사진은 여러 날에 걸칠 수 있다. 올린 날짜 아래에 "사진 N장 ·
  // 언제~언제"를 깔끔하게(takenAt 의 UTC 일자 기준).
  const photoCount = sortedAssets.length
  const takenDates = sortedAssets
    .flatMap((a) => (a.asset?.takenAt ? [a.asset.takenAt] : []))
    .sort((a, b) => a.getTime() - b.getTime())
  const fmtMD = (x: Date): string =>
    t('detail.monthDay', { m: x.getUTCMonth() + 1, d: x.getUTCDate() })
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
        ? t('detail.photoMetaWithRange', { n: photoCount, range: rangeLabel })
        : t('detail.photoMeta', { n: photoCount })
      : null

  return (
    <article className="overflow-hidden rounded-3xl border border-base-200 bg-base-0 shadow-card dark:border-base-800 dark:bg-base-900">
      {/* 헤더 — 아바타 · 이름 · 날짜 · 공개범위 칩. */}
      <header className="flex items-center gap-3 px-4 py-3">
        <div
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-point-500/25 to-point-600/10 text-[15px] font-bold tracking-tight text-point-600 dark:from-point-500/30 dark:to-point-600/15 dark:text-point-300"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold tracking-tight text-base-900 dark:text-base-50">
            {entry.baby?.name ?? t('detail.storyFallback')}
          </div>
          <div className="text-[12px] tabular-nums text-base-500 dark:text-base-400">
            {t('detail.dateLine', { date: dateLabel, day })}
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
            {t('detail.guardiansOnly')}
          </span>
        )}
      </header>

      {/* 본문(텍스트)을 사진 위에 — 텍스트 → 사진 순(1371). 무드 칩 → 제목 → 본문. */}
      {(mood || entry.title || trimmed.length > 0) && (
        <div className="px-4 pt-1 pb-3">
          {mood && (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${mood.chip}`}
              >
                <span className="text-[13px] leading-none">{mood.emoji}</span>
                {t(`mood.${entry.mood}`)}
              </span>
            </div>
          )}

          {entry.title && (
            <h1 className="mb-1.5 text-[17px] font-bold leading-tight tracking-tight text-base-900 dark:text-base-50">
              {entry.title}
            </h1>
          )}

          {trimmed.length > 0 && (
            <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.65] text-base-800 dark:text-base-200">
              {trimmed}
            </div>
          )}
        </div>
      )}

      {/* 사진 — 슬라이드(캐러셀) 또는 격자(갤러리) 토글. 여러 장일 때만 토글 노출.
          격자에서 탭하면 전체화면 뷰어(/detail/<publicNo>)로 연다. */}
      {sortedAssets.length > 0 && (
        <div className="relative bg-base-100 dark:bg-base-950">
          {sortedAssets.length > 1 && (
            <div className="absolute right-2.5 top-2.5 z-10 flex items-center gap-0.5 rounded-full bg-black/55 p-0.5 backdrop-blur-sm">
              <button
                type="button"
                aria-label={t('detail.viewSlide')}
                aria-pressed={view === 'slide'}
                onClick={() => chooseView('slide')}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${view === 'slide' ? 'bg-white/90 text-black' : 'text-white'}`}
              >
                <Square size={14} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                aria-label={t('detail.viewGrid')}
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
                  const isVid = link.asset?.kind === 'video'
                  const trio = isVid ? null : pickDisplayTrio(link.asset?.urls ?? null)
                  const fallbackUrl = isVid
                    ? pickVideoPosterUrl(link.asset?.urls ?? null)
                    : pickDisplayUrl(link.asset?.urls ?? null)
                  return (
                    <SwiperSlide
                      key={link.assetId}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {/* 탭하면 격자와 동일하게 전체화면 뷰어로(영상은 거기서 클릭 재생).
                          스와이프(드래그)는 Swiper 가 클릭과 구분해 처리. */}
                      {link.asset?.status === 'failed' ? (
                        <StoryFailedPhoto assetId={link.assetId} />
                      ) : (
                        <Link
                          href={`/detail/${link.asset?.publicNo}?ctx=story:${entry.id}`}
                          className="relative flex aspect-square w-full items-center justify-center"
                        >
                          <PictureImage
                            assetId={link.assetId}
                            urlKind="display"
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
                          {isVid && <VideoPlayOverlay />}
                        </Link>
                      )}
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
              {sortedAssets.map((link) => {
                const isVid = link.asset?.kind === 'video'
                if (link.asset?.status === 'failed') {
                  return (
                    <div key={link.assetId} className="relative aspect-square">
                      <StoryFailedPhoto assetId={link.assetId} compact />
                    </div>
                  )
                }
                return (
                  <Link
                    key={link.assetId}
                    href={`/detail/${link.asset?.publicNo}?ctx=story:${entry.id}`}
                    className="relative block aspect-square"
                  >
                    <PictureImage
                      assetId={link.assetId}
                      trio={isVid ? null : pickThumbTrio(link.asset?.urls ?? null)}
                      fallbackUrl={
                        isVid
                          ? pickVideoPosterUrl(link.asset?.urls ?? null)
                          : pickThumbUrl(link.asset?.urls ?? null)
                      }
                      alt=""
                      dominantColor={link.asset?.urls?.dominantColor ?? null}
                      blurhash={pickBlurhash(link.asset?.urls ?? null)}
                      aspectRatio={1}
                      className="aspect-square w-full"
                      objectFit="cover"
                    />
                    {isVid && <VideoPlayOverlay size="sm" />}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

/** 처리 실패한 스토리 사진 — 빈 슬라이드 대신 상태를 보여주고 그 자리에서 재처리. 상세
 *  뷰어엔 재시도가 없어(스토리에서 직접) 같은 /api/asset/:id/retry 를 호출한다. */
function StoryFailedPhoto({ assetId, compact }: { assetId: string; compact?: boolean }) {
  const t = useTranslations('story')
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const retry = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/asset/${assetId}/retry`, { method: 'POST' })
      if (!res.ok) throw new Error()
      toast({ title: t('detail.photoRetrying'), variant: 'success' })
      router.refresh()
    } catch {
      toast({ title: t('detail.photoRetryFailed'), variant: 'danger' })
      setBusy(false)
    }
  }
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-base-100 px-3 text-center dark:bg-base-800">
      <span className={`text-base-500 ${compact ? 'text-[11px]' : 'text-sm'}`}>
        {t('detail.photoFailed')}
      </span>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className={`rounded-full bg-base-900 font-medium text-base-50 transition active:scale-95 disabled:opacity-50 dark:bg-base-50 dark:text-base-900 ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
        }`}
      >
        {busy ? t('detail.photoRetrying') : t('detail.photoRetry')}
      </button>
    </div>
  )
}
