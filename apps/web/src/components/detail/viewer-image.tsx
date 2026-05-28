'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickDisplayTrio, pickDisplayUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { useRouter } from 'next/navigation'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Zoom } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/zoom'
import type { NavigateTo } from './viewer-shell'

type AssetSlim = {
  id: string
  kind: 'image' | 'video'
  urls: AssetUrls | null
  videoSrc: string | null
  posterUrl: string | undefined
}

// Swiper.js + Zoom module 으로 iOS Photos 식 카루셀. Swiper 가 velocity·momentum·
// rubber-band·pinch 를 다 가져가고, 우리는 (1) 세로 swipe-down 닫기, (2) 탭 토글
// 크로미, (3) navigateTo 콜백으로 ViewerShell state 갱신만 담당. Swiper 는 마운트된
// 채로 슬라이드 데이터(slim 배열) 만 교체된다 — 페이지 unmount/remount 가 없어
// 깜빡임이 사라진다.
const CLOSE_Y = 110
const TAP_SLOP = 8
const TAP_SUPPRESS_MS = 300

export function ViewerImage({
  current,
  siblings,
  navigateTo,
  chromeVisible,
  onToggleChrome,
}: {
  current: AssetSlim
  siblings: {
    prevId: string | undefined
    nextId: string | undefined
    prev: AssetSlim | null
    next: AssetSlim | null
  }
  navigateTo: NavigateTo
  /** When true, the image area shrinks to fit between the top bar + (mobile)
   *  action bar so chrome doesn't sit on top of the photo. */
  chromeVisible: boolean
  onToggleChrome?: () => void
}) {
  const router = useRouter()

  const goNext = useCallback(() => {
    if (siblings.nextId) navigateTo(siblings.nextId, 'next')
  }, [navigateTo, siblings.nextId])
  const goPrev = useCallback(() => {
    if (siblings.prevId) navigateTo(siblings.prevId, 'prev')
  }, [navigateTo, siblings.prevId])
  const goBack = useCallback(() => router.back(), [router])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'Escape') router.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext, router])

  const trio = pickDisplayTrio(current.urls)
  const fallbackUrl = pickDisplayUrl(current.urls)
  const isVideo = current.kind === 'video'
  const noMedia = isVideo ? current.videoSrc === null : trio === null && fallbackUrl === null

  if (noMedia) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-sm text-base-400">
        처리 중…
      </div>
    )
  }

  // 영상은 카루셀 안에 두지 않는다 — <video controls> 의 제스처(핀치 줌·시크 바)와
  // Swiper 의 슬라이드 드래그가 충돌. 기존 SwipeLayer(고정 임계치) 유지.
  if (isVideo) {
    return (
      <SwipeLayer
        enabled
        onNext={goNext}
        onPrev={goPrev}
        onClose={goBack}
        onTap={onToggleChrome}
        chromeVisible={chromeVisible}
      >
        <VideoWithFallback src={current.videoSrc ?? ''} poster={current.posterUrl} />
      </SwipeLayer>
    )
  }

  return (
    <SwiperViewport
      current={current}
      prev={siblings.prev}
      next={siblings.next}
      chromeVisible={chromeVisible}
      onNext={goNext}
      onPrev={goPrev}
      onClose={goBack}
      onTap={onToggleChrome}
    />
  )
}

function SwiperViewport({
  current,
  prev,
  next,
  chromeVisible,
  onNext,
  onPrev,
  onClose,
  onTap,
}: {
  current: AssetSlim
  prev: AssetSlim | null
  next: AssetSlim | null
  chromeVisible: boolean
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onTap: (() => void) | undefined
}) {
  // 슬라이드 배열 + initialSlide 계산. prev 가 있으면 [prev,current,next] 의 1,
  // 없으면 [current,next] 의 0. next 가 없어도 마찬가지로 prev 가 있으면 1.
  // 키는 슬롯 역할('prev'/'current'/'next')로 — id 로 키하면 사진 전환 시 DOM 이
  // 재셔플되어 Swiper 가 의도와 다른 슬라이드로 움직인다. 슬롯 키면 슬라이드 노드는
  // 그대로 두고 안의 SlideContent 만 새 slim 으로 리렌더 → 부드러운 슬라이드 + slideTo(0)
  // 침묵 재중앙화가 동작.
  const slides: Array<{ slim: AssetSlim; role: 'prev' | 'current' | 'next' }> = []
  if (prev) slides.push({ slim: prev, role: 'prev' })
  slides.push({ slim: current, role: 'current' })
  if (next) slides.push({ slim: next, role: 'next' })
  const initialSlide = prev ? 1 : 0
  const currentIndex = initialSlide
  const hasPrev = !!prev
  const hasNext = !!next

  // 줌 여부: pinch 또는 double-tap 으로 줌인되면 세로 swipe-down 닫기를 죽인다.
  const [zoomed, setZoomed] = useState(false)

  // Swiper 인스턴스 — current.id 가 변하면 silently (애니메이션 없이) 새 currentIndex 로
  // 슬라이드해서 중앙 정렬. ViewerShell 의 state 갱신이 트리거.
  // biome-ignore lint/suspicious/noExplicitAny: swiper instance type complex; use minimal surface
  const swiperRef = useRef<any>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: current.id 변경이 트리거. 다른 deps 는 의도적으로 제외(stale 캡쳐 위험 없음).
  useEffect(() => {
    const s = swiperRef.current
    if (s && s.activeIndex !== currentIndex) {
      // duration 0 + no event emit — 새 슬라이드 마운트 직후 침묵 동기화.
      s.slideTo(currentIndex, 0, false)
    }
  }, [current.id])

  // 탭 vs 스와이프 구분: 스와이프 후 합성 click 으로 onTap 이 호출돼 크로미가
  // 깜빡이는 걸 막기 위한 가드. Swiper 슬라이드 변경/줌 변경 직후 잠시 무시.
  const suppressTap = useRef(false)
  const armSuppressTap = useCallback(() => {
    suppressTap.current = true
    window.setTimeout(() => {
      suppressTap.current = false
    }, TAP_SUPPRESS_MS)
  }, [])

  const handleSlideChange = useCallback(
    (swiper: { activeIndex: number }) => {
      const idx = swiper.activeIndex
      if (idx === currentIndex) return
      armSuppressTap()
      if (idx < currentIndex && hasPrev) onPrev()
      else if (idx > currentIndex && hasNext) onNext()
    },
    [currentIndex, hasPrev, hasNext, onPrev, onNext, armSuppressTap],
  )

  // 세로 swipe-down 닫기 — Swiper 가 가져가지 않는 vertical 단일터치만 추적.
  // 가로/핀치/줌 상태에선 즉시 포기.
  const dragRef = useRef<{
    startX: number
    startY: number
    dx: number
    dy: number
    active: boolean
    moved: boolean
    multi: boolean
  } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      dragRef.current = null
      return
    }
    const t = e.touches[0]
    if (!t) return
    dragRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      dx: 0,
      dy: 0,
      active: true,
      moved: false,
      multi: false,
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const d = dragRef.current
    if (!d) return
    if (e.touches.length > 1) {
      d.multi = true
      d.active = false
      return
    }
    const t = e.touches[0]
    if (!t) return
    d.dx = t.clientX - d.startX
    d.dy = t.clientY - d.startY
    if (!d.moved && (Math.abs(d.dx) > TAP_SLOP || Math.abs(d.dy) > TAP_SLOP)) {
      d.moved = true
    }
  }, [])

  const onTouchEnd = useCallback(() => {
    const d = dragRef.current
    dragRef.current = null
    if (!d?.active || !d.moved || d.multi) return
    armSuppressTap()
    // 줌 상태에서는 닫기 제스처 무시(Swiper Zoom 의 팬과 충돌).
    if (zoomed) return
    // 세로(아래) 닫기 — |dy| > |dx| && dy > CLOSE_Y. 가로 우세면 Swiper 가 처리.
    if (Math.abs(d.dy) > Math.abs(d.dx) && d.dy > CLOSE_Y) {
      onClose()
    }
  }, [zoomed, onClose, armSuppressTap])

  return (
    <div
      onClick={() => {
        if (!suppressTap.current) onTap?.()
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        dragRef.current = null
      }}
      // h-screen + dynamic top/bottom padding so the photo fits BETWEEN the top
      // bar and (mobile) action bar when chrome is showing. Desktop has no
      // bottom action bar (md:pb-0).
      className={`relative h-screen w-full overflow-hidden transition-[padding] duration-200 ease-out ${
        chromeVisible
          ? 'pt-[calc(env(safe-area-inset-top)+56px)] pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-0'
          : 'pt-0 pb-0'
      }`}
    >
      <Swiper
        modules={[Zoom]}
        initialSlide={initialSlide}
        slidesPerView={1}
        spaceBetween={0}
        speed={300}
        resistance={true}
        resistanceRatio={0.5}
        threshold={5}
        zoom={{ maxRatio: 4, minRatio: 1, toggle: true }}
        onSwiper={(s) => {
          swiperRef.current = s
        }}
        onSlideChange={handleSlideChange}
        onZoomChange={(_s, scale) => setZoomed(scale > 1.01)}
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        {slides.map(({ slim, role }) => (
          <SwiperSlide
            key={role}
            zoom
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <SlideContent slim={slim} isCurrent={role === 'current'} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}

function SlideContent({ slim, isCurrent }: { slim: AssetSlim; isCurrent: boolean }) {
  const trio = pickDisplayTrio(slim.urls)
  const fallbackUrl = pickDisplayUrl(slim.urls)
  const blurhash = pickBlurhash(slim.urls)
  const isVideo = slim.kind === 'video'

  // 영상 슬롯은 포스터만 보여줌(prev/next 위치). 실제 재생은 navigate 후 ViewerImage
  // 의 video 분기에서. current 가 video 면 ViewerImage 의 영상 분기로 일찍 빠져서
  // 여기 안 옴.
  if (isVideo) {
    if (!slim.posterUrl) return <div className="h-full w-full" />
    return (
      <img
        src={slim.posterUrl}
        alt=""
        className="max-h-full max-w-full"
        style={{ objectFit: 'contain' }}
      />
    )
  }

  // current 만 view-transition-name 부여 — 타임라인 썸네일(같은 asset-{id})에서
  // 풀스크린 이미지로 매칭돼 자라는 iOS Photos 식 morph. 클라이언트 사이드 nav 는
  // URL 을 history.replaceState 로만 바꿔 RSC 가 안 돌므로 view transition 은 첫 진입에만
  // 동작 — 의도된 거동(스와이프 자체는 Swiper transform 으로 부드럽게 처리됨).
  const style: CSSProperties | undefined = isCurrent
    ? ({ viewTransitionName: `asset-${slim.id}` } as CSSProperties)
    : undefined

  return (
    <PictureImage
      trio={trio}
      fallbackUrl={fallbackUrl}
      alt=""
      dominantColor={slim.urls?.dominantColor ?? null}
      blurhash={blurhash}
      aspectRatio={slim.urls?.aspectRatio ?? null}
      loading="eager"
      fetchPriority={isCurrent ? 'high' : 'low'}
      objectFit="contain"
      className="max-h-full max-w-full"
      {...(style ? { style } : {})}
    />
  )
}

// 영상용 단순 SwipeLayer — 영상은 <video controls> 의 제스처와 Swiper 가 충돌해
// 카루셀 밖에 둠. 기존 detect-then-navigate 거동 그대로.
const SWIPE_X = 60
const TAP_SLOP_V = 8

function SwipeLayer({
  enabled,
  onNext,
  onPrev,
  onClose,
  onTap,
  chromeVisible,
  children,
}: {
  enabled: boolean
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onTap?: (() => void) | undefined
  chromeVisible: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const cfg = useRef({ enabled, onNext, onPrev, onClose, onTap })
  cfg.current = { enabled, onNext, onPrev, onClose, onTap }
  const suppressTap = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number } | null = null
    let multi = false
    let moved = false

    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        multi = true
        start = null
        return
      }
      multi = false
      moved = false
      const t = e.touches[0]
      start = t ? { x: t.clientX, y: t.clientY } : null
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        multi = true
        start = null
        return
      }
      const t = e.touches[0]
      if (!start || !t) return
      if (
        Math.abs(t.clientX - start.x) > TAP_SLOP_V ||
        Math.abs(t.clientY - start.y) > TAP_SLOP_V
      ) {
        moved = true
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (multi) {
        if (e.touches.length === 0) multi = false
        start = null
        return
      }
      const s = start
      start = null
      if (!s) return
      if (!moved) return
      suppressTap.current = true
      window.setTimeout(() => {
        suppressTap.current = false
      }, 350)
      const c = cfg.current
      if (!c.enabled) return
      const ch = e.changedTouches[0]
      if (!ch) return
      const dx = ch.clientX - s.x
      const dy = ch.clientY - s.y
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < -SWIPE_X) c.onNext()
        else if (dx > SWIPE_X) c.onPrev()
      } else if (dy > CLOSE_Y) {
        c.onClose()
      }
    }

    const opts: AddEventListenerOptions = { capture: true, passive: true }
    el.addEventListener('touchstart', onStart, opts)
    el.addEventListener('touchmove', onMove, opts)
    el.addEventListener('touchend', onEnd, opts)
    return () => {
      el.removeEventListener('touchstart', onStart, opts)
      el.removeEventListener('touchmove', onMove, opts)
      el.removeEventListener('touchend', onEnd, opts)
    }
  }, [])

  return (
    <div
      ref={ref}
      onClick={() => {
        if (!suppressTap.current) cfg.current.onTap?.()
      }}
      className={`flex h-screen w-full items-center justify-center transition-[padding] duration-200 ease-out ${
        chromeVisible
          ? 'pt-[calc(env(safe-area-inset-top)+56px)] pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-0'
          : 'pt-0 pb-0'
      }`}
    >
      {children}
    </div>
  )
}

function VideoWithFallback({ src, poster }: { src: string; poster: string | undefined }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center text-sm text-base-300">
        <p>이 기기에서 재생할 수 없는 형식이에요.</p>
        <a href={src} download className="rounded-full bg-base-700 px-4 py-2 text-base-50">
          원본 다운로드
        </a>
      </div>
    )
  }
  return (
    <video
      src={src}
      poster={poster}
      controls
      playsInline
      onError={() => setFailed(true)}
      className="max-h-full max-w-full"
    >
      <track kind="captions" />
    </video>
  )
}
