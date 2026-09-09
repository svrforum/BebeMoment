'use client'
import { PictureImage } from '@/components/ui/picture-image'
import {
  pickBlurhash,
  pickDisplayTrio,
  pickDisplayUrl,
  pickThumbTrio,
  pickThumbUrl,
  pickVideoPosterUrl,
  pickVideoUrl,
} from '@/lib/asset-url'
import { recallStorySlide, rememberStorySlide } from '@/lib/story-slide-memory'
import type { AssetWithUrls } from '@/server/asset/types'
import type { Baby, Story, StoryAsset } from '@bebe/db-public'
import { useFamilySSE } from '@/lib/sse'
import { useToast } from '@/lib/toast'
import { LayoutGrid, Maximize2, Play, ShieldCheck, Square } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Swiper as SwiperClass } from 'swiper'
import { Pagination } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/pagination'
import { MOODS, isMood } from './mood'

type Entry = Story & {
  assets: (StoryAsset & { asset: AssetWithUrls | null })[]
  baby: Baby | null
}

/**
 * 스토리 카드 안에서 바로 재생하는 영상 슬라이드.
 *
 * 예전엔 탭이 전체화면 뷰어로 넘어가기만 해서, 짧은 클립 하나 보려고 화면을 옮겨야 했다.
 * 가운데 재생 버튼은 그 자리에서 재생하고, 전체화면은 옆의 버튼으로 연다. 재생이 시작되면
 * 네이티브 컨트롤(자체 전체화면 포함)이 그 자리를 대신하므로 우리 버튼은 물러난다.
 */
function StoryVideoSlide({
  src,
  poster,
  href,
  isActive,
  playLabel,
  fullscreenLabel,
  onStartedChange,
}: {
  src: string
  poster: string | undefined
  href: string
  isActive: boolean
  playLabel: string
  fullscreenLabel: string
  onStartedChange: (started: boolean) => void
}) {
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)

  const setBoth = useCallback(
    (v: boolean) => {
      setStarted(v)
      onStartedChange(v)
    },
    [onStartedChange],
  )

  // 다른 사진으로 넘어가면 소리가 따라다니지 않게 멈춘다.
  useEffect(() => {
    if (isActive) return
    ref.current?.pause()
    setBoth(false)
  }, [isActive, setBoth])

  return (
    <div className="relative flex aspect-square w-full items-center justify-center bg-black">
      <video
        ref={ref}
        src={src}
        {...(poster ? { poster } : {})}
        controls={started}
        playsInline
        preload="metadata"
        // 네이티브 컨트롤의 전체화면 버튼은 앱의 WebView 에서 죽은 버튼이다 — Capacitor 의
        // BridgeWebChromeClient 가 onShowCustomView 에서 곧바로 취소해 버려서, 눌러도
        // 전체화면에 들어갔다 즉시 되돌아온다. 전체화면은 옆의 버튼(우리 뷰어)으로만 연다.
        // noremoteplayback 도 함께 — 안드로이드 WebView 는 disablePictureInPicture 를
        // 무시하지만 controlsList 는 따른다.
        controlsList="nofullscreen noremoteplayback"
        disablePictureInPicture
        onPlay={() => setBoth(true)}
        // 재생 중에는 가로 드래그가 seek 바를 위한 것이다 — Swiper 가 가져가지 않게.
        className={`h-full w-full object-contain ${started ? 'swiper-no-swiping' : ''}`}
        style={{ touchAction: 'pan-y' }}
      >
        <track kind="captions" />
      </video>
      {!started && (
        <button
          type="button"
          onClick={() => {
            void ref.current?.play()
          }}
          aria-label={playLabel}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 ring-1 ring-white/30 backdrop-blur-sm transition active:scale-95">
            <Play size={24} className="ml-0.5 fill-white text-white" strokeWidth={0} />
          </span>
        </button>
      )}
      {/* 전체화면은 재생 중에도 갈 수 있어야 한다 — 네이티브 전체화면을 없앴으므로 이게
          유일한 길이다. 오른쪽 가장자리 세로 가운데: 위의 사진 번호·보기 토글과도, 아래의
          네이티브 컨트롤 바(높이가 브라우저마다 다르다)와도 겹치지 않는 유일한 자리다. */}
      <Link
        href={href}
        aria-label={fullscreenLabel}
        className="-translate-y-1/2 absolute top-1/2 right-2.5 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition active:scale-95"
      >
        <Maximize2 size={15} strokeWidth={2.2} />
      </Link>
    </div>
  )
}

// 격자 썸네일 위 중앙 재생 아이콘 — 영상임을 알리고 탭(→ 전체화면 뷰어)을 유도.
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
  const swiperRef = useRef<SwiperClass | null>(null)
  // 재생이 시작되면 네이티브 컨트롤이 슬라이드 아래를 차지한다 — seek 바와 페이지 점이
  // 손가락 하나 폭 안에서 겹쳐 오탭이 난다. 재생 중에는 점을 접어 둔다.
  const [videoStarted, setVideoStarted] = useState(false)

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
                // 전체화면에 다녀오면 이 컴포넌트는 새로 마운트된다 — 마지막으로 보던
                // 사진으로 되돌려 놓지 않으면 항상 첫 장으로 튕긴다. 뷰어도 스와이프할
                // 때마다 같은 자리에 기록하므로, 거기서 넘긴 사진으로 돌아온다.
                onSwiper={(s) => {
                  swiperRef.current = s
                  const last = recallStorySlide(entry.id)
                  if (!last) return
                  const idx = sortedAssets.findIndex((a) => a.assetId === last)
                  if (idx > 0) {
                    s.slideTo(idx, 0)
                    setActiveIdx(idx)
                  }
                }}
                onSlideChange={(s) => {
                  setActiveIdx(s.activeIndex)
                  const id = sortedAssets[s.activeIndex]?.assetId
                  if (id) rememberStorySlide(entry.id, id)
                }}
                className={`story-carousel aspect-square w-full ${videoStarted ? 'is-playing' : ''}`}
              >
                {sortedAssets.map((link, i) => {
                  const isVid = link.asset?.kind === 'video'
                  const videoSrc = isVid ? pickVideoUrl(link.asset?.urls ?? null) : null
                  const trio = isVid ? null : pickDisplayTrio(link.asset?.urls ?? null)
                  const fallbackUrl = isVid
                    ? pickVideoPosterUrl(link.asset?.urls ?? null)
                    : pickDisplayUrl(link.asset?.urls ?? null)
                  return (
                    <SwiperSlide
                      key={link.assetId}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {/* 사진은 탭하면 전체화면 뷰어로, 영상은 그 자리에서 재생.
                          스와이프(드래그)는 Swiper 가 클릭과 구분해 처리. */}
                      {link.asset && link.asset.status !== 'ready' ? (
                        <StoryPendingPhoto assetId={link.assetId} status={link.asset.status} />
                      ) : isVid && videoSrc ? (
                        <StoryVideoSlide
                          src={videoSrc}
                          poster={pickVideoPosterUrl(link.asset?.urls ?? null) ?? undefined}
                          href={`/detail/${link.asset?.publicNo}?ctx=story:${entry.id}`}
                          isActive={activeIdx === i}
                          playLabel={t('detail.videoPlay')}
                          fullscreenLabel={t('detail.videoFullscreen')}
                          onStartedChange={setVideoStarted}
                        />
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
                <span className="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums backdrop-blur-sm">
                  {activeIdx + 1}/{sortedAssets.length}
                </span>
              )}
            </>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">
              {sortedAssets.map((link) => {
                const isVid = link.asset?.kind === 'video'
                if (link.asset && link.asset.status !== 'ready') {
                  return (
                    <div key={link.assetId} className="relative aspect-square">
                      <StoryPendingPhoto
                        assetId={link.assetId}
                        status={link.asset.status}
                        compact
                      />
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

/**
 * 아직 볼 수 없는 스토리 사진 — 실패·업로드중·처리중.
 *
 * 예전엔 `failed` 만 걸러서, 업로드가 끊긴 영상이 **빈 타일 + 재생 버튼**으로 나왔다.
 * 재생될 리 없는 걸 재생 가능한 것처럼 보여준 셈이라(§6 조용한 실패 금지) 사용자는
 * "영상이 재생 안 된다"고 겪는다. ready 가 아니면 무엇이든 상태를 말해 준다.
 * 실패한 것만 그 자리에서 재처리(상세 뷰어엔 재시도가 없어 같은 /api/asset/:id/retry).
 */
function StoryPendingPhoto({
  assetId,
  status,
  compact,
}: {
  assetId: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  compact?: boolean
}) {
  const t = useTranslations('story')
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const retry = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/asset/${assetId}/retry`, { method: 'POST' })
      if (!res.ok) {
        // 원본이 없으면 몇 번을 눌러도 같은 결과다 — 서버가 준 이유("다시 올려주세요")를
        // 그대로 보여준다. 타임라인 타일과 같은 처리.
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        toast({ title: body?.error ?? t('detail.photoRetryFailed'), variant: 'danger' })
        setBusy(false)
        return
      }
      toast({ title: t('detail.photoRetrying'), variant: 'success' })
      router.refresh()
    } catch {
      toast({ title: t('detail.photoRetryFailed'), variant: 'danger' })
      setBusy(false)
    }
  }
  const label =
    status === 'failed'
      ? t('detail.photoFailed')
      : status === 'uploading'
        ? t('detail.photoUploading')
        : t('detail.photoProcessing')
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-base-100 px-3 text-center dark:bg-base-800">
      <span className={`text-base-500 ${compact ? 'text-[11px]' : 'text-sm'}`}>{label}</span>
      {status === 'failed' && (
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
      )}
    </div>
  )
}
