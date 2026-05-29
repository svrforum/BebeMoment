'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickDisplayTrio, pickDisplayUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { useRouter } from 'next/navigation'
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { Zoom } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/zoom'
import type { NavigateTo } from './viewer-shell'

type AssetSlim = {
  id: string
  publicNo: number
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

  // 영상도 SwiperViewport 가 처리 — 사진↔영상 전환에서 컴포넌트 swap 이 일어나면
  // 깜빡임이 생긴다. 영상은 SlideContent 안에서 current 슬롯일 때만 <video controls>
  // 로 렌더, 옆 슬롯은 poster 만 (Swiper 가 양쪽을 캐러셀로 다룸). seek bar 와의
  // 충돌은 `swiper-no-swiping` 클래스로 해결 (Swiper 기본 selector).
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
  // 슬라이드 배열 + initialSlide 계산. 타임라인 = 최신이 위 → 카루셀에서
  // "다음으로 넘기는 방향(왼쪽 스와이프)" = 더 newer. 그래서 slot 0 = next(older),
  // slot 2 = prev(newer) 로 정렬한다 (Instagram/Kakao 등 한국 사용자가 익숙한 방향).
  // 키는 슬롯 역할('prev'/'current'/'next')로 — id 로 키하면 사진 전환 시 DOM 이
  // 재셔플되어 Swiper 가 의도와 다른 슬라이드로 움직인다. 슬롯 키면 슬라이드 노드는
  // 그대로 두고 안의 SlideContent 만 새 slim 으로 리렌더 → 부드러운 슬라이드 + slideTo
  // 침묵 재중앙화가 동작.
  const slides: Array<{ slim: AssetSlim; role: 'prev' | 'current' | 'next' }> = []
  if (next) slides.push({ slim: next, role: 'next' })
  slides.push({ slim: current, role: 'current' })
  if (prev) slides.push({ slim: prev, role: 'prev' })
  const initialSlide = next ? 1 : 0
  const currentIndex = initialSlide
  const hasPrev = !!prev
  const hasNext = !!next

  // 줌 여부: pinch 또는 double-tap 으로 줌인되면 세로 swipe-down 닫기를 죽인다.
  const [zoomed, setZoomed] = useState(false)

  // Swiper 인스턴스 — current.id 또는 슬롯 레이아웃(currentIndex)이 변하면 silently
  // (애니메이션 없이) currentIndex 로 슬라이드해 중앙 정렬. ViewerShell 의 state 갱신이 트리거.
  // ⚠️ currentIndex 를 deps 에 반드시 포함: 가장 오래된 자산으로 이동하면 뒤이은
  // viewer-bundle fetch 로 next 가 null 이 되어 currentIndex 가 1→0 으로 줄어든다. 이때
  // current.id 는 안 변하므로 current.id 만 보던 과거 버전은 재중앙화를 건너뛰어 activeIndex
  // 가 1(=prev/더 최신 슬롯)에 남았다 → "넘기면 이전 사진으로 되돌아가는" 버그. 이 뷰어의
  // 핵심 불변식은 'activeIndex === currentIndex' 이며, 그 둘을 깨는 모든 변화(id·레이아웃)에
  // 재중앙화가 걸려야 한다.
  // biome-ignore lint/suspicious/noExplicitAny: swiper instance type complex; use minimal surface
  const swiperRef = useRef<any>(null)
  // current.id 는 본문에서 읽지 않지만 의도적 트리거다 — currentIndex 가 1 로 유지되는 일반
  // 스와이프(다음/이전 사진) 후에도 스와이프한 슬롯(0/2)에서 중앙(1)으로 재정렬해야 하므로
  // id 변화로 effect 를 깨워야 한다. currentIndex 는 가장 오래된 자산 경계(1→0)를 잡는다. 둘 다 필요.
  // biome-ignore lint/correctness/useExhaustiveDependencies: current.id 는 위 사유로 의도적 트리거.
  useEffect(() => {
    const s = swiperRef.current
    if (s && s.activeIndex !== currentIndex) {
      // duration 0 + no event emit — 새 슬라이드 마운트 직후 침묵 동기화.
      s.slideTo(currentIndex, 0, false)
    }
  }, [current.id, currentIndex])

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
      // slot 0 = next (older), slot 2 = prev (newer) — 왼쪽 스와이프(idx 증가) = newer.
      if (idx > currentIndex && hasPrev) onPrev()
      else if (idx < currentIndex && hasNext) onNext()
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
        // Swiper 기본 focusableElements 에 'video' 가 포함돼 있어 Capacitor WebView 에서
        // 영상이 자동 포커스되면 touchmove 가 short-circuit 돼 스와이프가 죽는다.
        // video 만 빼서 — 입력 요소들의 키 입력은 그대로 보호하면서 영상은 자유롭게 드래그.
        focusableElements="input, select, option, textarea, button, label"
        zoom={{ maxRatio: 4, minRatio: 1, toggle: true }}
        onSwiper={(s) => {
          swiperRef.current = s
        }}
        // 슬라이드 애니메이션이 완전히 끝난 다음에 navigate — onSlideChange (mid-transition)
        // 으로 받으면 setCurrentSlim → useEffect → slideTo(1,0) 가 진행 중인 transform 을
        // 끊어 "한방에 휙" 점프하는 느낌이 난다. transitionEnd 면 사용자가 새 슬라이드를
        // 다 본 뒤 재중앙화가 일어나 슬롯이 같은 이미지로 정렬돼 시각적으로 무손실.
        onSlideChangeTransitionEnd={handleSlideChange}
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

  if (isVideo) {
    // current 슬롯이면 실제 <video controls> 재생, 옆 슬롯이면 poster 만.
    // `swiper-no-swiping` 은 안 붙임 — 붙이면 영상이 화면 대부분을 차지해서 스와이프할
    // 빈 공간이 없어진다(사용자 피드백). 대신 Swiper 가 영상 위에서도 드래그를 잡음.
    // 트레이드오프: 영상 컨트롤이 떠 있을 때 seek bar 를 드래그하면 스와이프로 처리될
    // 수 있음 — 탭으로 시크 위치를 정하는 게 모바일 기본 사용 패턴이라 큰 문제 없음.
    if (isCurrent) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <VideoWithFallback src={slim.videoSrc ?? ''} poster={slim.posterUrl} />
        </div>
      )
    }
    if (!slim.posterUrl) return <div className="h-full w-full" />
    return (
      // biome-ignore lint/performance/noImgElement: 미디어 서버의 signed URL — next/image 부적합
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
      // 뷰어는 페이드 끔 — 영상→사진처럼 current 슬롯이 비디오에서 새 이미지로 교체될 때
      // blurhash 페이드인이 재생돼 깜빡이는 걸 막는다(형제 슬라이드가 이미 디코드됨).
      fade={false}
      className="max-h-full max-w-full"
      {...(style ? { style } : {})}
    />
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
      // 영상은 기본 touch-action: auto 라 모바일 WebView 가 가로 터치를 자체 제스처에
      // 쓸 수 있다 → Swiper 에 도달 못 함. pan-y 로 좁혀서 가로는 JS(Swiper) 로 패스.
      style={{ touchAction: 'pan-y' }}
    >
      <track kind="captions" />
    </video>
  )
}
