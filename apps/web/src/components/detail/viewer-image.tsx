'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickDisplayTrio, pickDisplayUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { useRouter } from 'next/navigation'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

type AssetSlim = {
  id: string
  kind: 'image' | 'video'
  urls: AssetUrls | null
  videoSrc: string | null
  posterUrl: string | undefined
}

// iOS Photos 식 핑거 트랙 카루셀. 세 슬롯(prev/current/next)이 한 트랙에 놓이고,
// touchmove 가 트랙을 dx 만큼 translate3d. release 시 임계치를 넘으면 그 방향으로
// 스냅 → router.replace. 줌(>1) 일 때 가로 스와이프는 죽고 rzpp 가 팬을 가져감.
//
// 임계치·이징 (iOS Photos 비슷한 느낌):
//   THRESHOLD_RATIO = 0.25  (뷰포트 25% 이상 끌면 그 방향으로 commit)
//   SNAP_MS         = 280   (스냅 시간, cubic-bezier(0.32, 0.72, 0, 1))
//   CLOSE_Y         = 110   (단일터치 + |dy|>|dx| 일 때 닫기 임계치)
//   RUBBER          = 0.35  (가장자리(prev/next 없음) 러버밴드 감쇠)
const THRESHOLD_RATIO = 0.25
const SNAP_MS = 280
const SNAP_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CLOSE_Y = 110
const RUBBER = 0.35
const TAP_SLOP = 8

export function ViewerImage({
  current,
  siblings,
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
  /** When true, the image area shrinks to fit between the top bar + (mobile)
   *  action bar so chrome doesn't sit on top of the photo. */
  chromeVisible: boolean
  onToggleChrome?: () => void
}) {
  const router = useRouter()
  const [scale, setScale] = useState(1)

  // 스와이프 이동은 replace — push 면 이미지마다 히스토리가 쌓여 닫기(X·뒤로·Esc·
  // 드래그다운=router.back)가 이전 이미지로 가버린다. replace 면 히스토리가
  // [그리드, 현재이미지] 로 유지돼 닫기가 그리드로 정확히 나간다. View Transition
  // 은 per-id view-transition-name (asset-{id}) 으로 처리 — 타임라인 썸네일에서
  // 디테일로 갈 때 같은 id 가 매칭돼 사진이 풀스크린으로 자라는 iOS Photos 식
  // 전환이 나온다. 디테일↔디테일 형제 이동은 id 가 달라 매칭 없음 → 기본 UA
  // 크로스페이드(짧고 깔끔). 한 손가락 핑거트랙 스와이프는 트랙 자체가 따라오면서
  // 보여주므로 페이지 전환 시 시각적 점프가 거의 없다.
  const goNext = useCallback(() => {
    if (siblings.nextId) router.replace(`/detail/${siblings.nextId}`)
  }, [router, siblings.nextId])
  const goPrev = useCallback(() => {
    if (siblings.prevId) router.replace(`/detail/${siblings.prevId}`)
  }, [router, siblings.prevId])
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

  // 줌 ≤ 1 (사실상 1) 일 때만 가로 스와이프 활성. 줌인이면 rzpp 가 팬을 가져감.
  const swipeEnabled = scale <= 1.01

  if (noMedia) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-sm text-base-400">
        처리 중…
      </div>
    )
  }

  // 영상은 카루셀 안에 두지 않는다 — <video controls> 의 제스처(핀치 줌·시크 바)와
  // 트랙 드래그가 충돌. 단순 SwipeLayer(고정 임계치) 유지.
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
    <CarouselViewport
      current={current}
      prev={siblings.prev}
      next={siblings.next}
      chromeVisible={chromeVisible}
      swipeEnabled={swipeEnabled}
      onNext={goNext}
      onPrev={goPrev}
      onClose={goBack}
      onTap={onToggleChrome}
      onScaleChange={setScale}
    />
  )
}

function CarouselViewport({
  current,
  prev,
  next,
  chromeVisible,
  swipeEnabled,
  onNext,
  onPrev,
  onClose,
  onTap,
  onScaleChange,
}: {
  current: AssetSlim
  prev: AssetSlim | null
  next: AssetSlim | null
  chromeVisible: boolean
  swipeEnabled: boolean
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onTap: (() => void) | undefined
  onScaleChange: (s: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  // 드래그 상태: ref 로 보관 — setState 로 매 프레임 리렌더하면 사진/줌 노드가
  // 재마운트되어 핀치/줌이 깨진다. 실제 위치는 직접 style.transform 으로 적용.
  const drag = useRef<{
    startX: number
    startY: number
    dx: number
    dy: number
    active: boolean
    multi: boolean
    moved: boolean
    axis: 'none' | 'h' | 'v'
    viewportWidth: number
  }>({
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    active: false,
    multi: false,
    moved: false,
    axis: 'none',
    viewportWidth: 0,
  })
  // 스와이프 직후 합성 click(onTap=크롬 토글) 가드.
  const suppressTap = useRef(false)
  // 핸들러는 mount 1회. 콜백·enabled 는 ref 로 매번 갱신.
  const cfg = useRef({
    swipeEnabled,
    onNext,
    onPrev,
    onClose,
    onTap,
    hasPrev: !!prev,
    hasNext: !!next,
  })
  cfg.current = {
    swipeEnabled,
    onNext,
    onPrev,
    onClose,
    onTap,
    hasPrev: !!prev,
    hasNext: !!next,
  }

  const setTrackTransform = useCallback((dx: number, withTransition: boolean) => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = withTransition ? `transform ${SNAP_MS}ms ${SNAP_EASING}` : 'none'
    // 트랙은 300% width — `-100%/3` 가 정확히 1 슬롯(= 1 뷰포트) 좌측 이동.
    // 잘못된 `-100%` 는 트랙 전체 폭(=3 뷰포트) 만큼 밀어 화면 밖으로 사라지게 한다.
    el.style.transform = `translate3d(calc(-100% / 3 + ${dx}px), 0, 0)`
  }, [])

  // current.id 가 바뀌면(스냅 후 router.replace 의 다음 페이지 RSC 가 도착) 트랙을
  // 즉시 중앙(dx=0)으로 리셋. 새 페이지의 prev/current/next 가 자연스러운 0 위치에
  // 정렬됨 → 시각적 점프 없음. biome 은 setTrackTransform 의 안정성을 보고 current.id
  // 가 "불필요" 하다고 보지만 실제로 우리는 id 변경을 트리거로 쓴다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: current.id 변경이 이 이펙트의 트리거. setTrackTransform 은 stable.
  useEffect(() => {
    setTrackTransform(0, false)
    drag.current.dx = 0
    drag.current.dy = 0
    drag.current.axis = 'none'
    drag.current.active = false
  }, [current.id, setTrackTransform])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        drag.current.multi = true
        drag.current.active = false
        drag.current.axis = 'none'
        // 핀치 시작 시 진행 중이던 가로 드래그 즉시 원위치(이펙트 없이).
        setTrackTransform(0, false)
        drag.current.dx = 0
        drag.current.dy = 0
        return
      }
      drag.current.multi = false
      const t = e.touches[0]
      if (!t) return
      drag.current.startX = t.clientX
      drag.current.startY = t.clientY
      drag.current.dx = 0
      drag.current.dy = 0
      drag.current.axis = 'none'
      drag.current.moved = false
      drag.current.active = true
      drag.current.viewportWidth = el.clientWidth
    }

    const onMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        if (drag.current.active) {
          setTrackTransform(0, false)
          drag.current.active = false
        }
        drag.current.multi = true
        return
      }
      if (!drag.current.active) return
      const t = e.touches[0]
      if (!t) return
      const dx = t.clientX - drag.current.startX
      const dy = t.clientY - drag.current.startY
      if (drag.current.axis === 'none' && (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP)) {
        drag.current.moved = true
        drag.current.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
      drag.current.dx = dx
      drag.current.dy = dy
      // 줌 상태면 가로 트랙 이동 정지(rzpp 가 팬). 다만 세로 닫기 제스처는 줌 ≤1
      // 일 때만 의미 있어서 그쪽도 트랙은 안 움직임.
      if (!cfg.current.swipeEnabled) return
      if (drag.current.axis !== 'h') return
      // 가장자리 러버밴드: prev 없는 상태에서 오른쪽으로 끌거나, next 없는 상태에서
      // 왼쪽으로 끌면 1차 감쇠. (iOS Photos 와 동일 — 끌리긴 끌리지만 잘 안 따라옴.)
      let applied = dx
      if (dx > 0 && !cfg.current.hasPrev) applied = dx * RUBBER
      else if (dx < 0 && !cfg.current.hasNext) applied = dx * RUBBER
      setTrackTransform(applied, false)
    }

    const onEnd = (e: TouchEvent) => {
      const wasMulti = drag.current.multi
      if (wasMulti) {
        if (e.touches.length === 0) drag.current.multi = false
        // 핀치 종료 — rzpp 에 맡김.
        return
      }
      if (!drag.current.active) return
      drag.current.active = false
      // 탭(움직임 없음): 합성 click 이 onTap 처리.
      if (!drag.current.moved) return
      // 스와이프 직후 따라오는 합성 click 은 무시(크롬이 깜빡임).
      suppressTap.current = true
      window.setTimeout(() => {
        suppressTap.current = false
      }, 350)

      const c = cfg.current
      const { axis, dx, dy, viewportWidth } = drag.current

      // 줌 상태에서는 가로 스와이프 무시(rzpp 가 다 가져감).
      if (!c.swipeEnabled) {
        setTrackTransform(0, false)
        return
      }

      // 세로(아래로) 닫기 — 단일터치 + dy > 110 + |dy|>|dx|.
      if (axis === 'v') {
        if (dy > CLOSE_Y) {
          c.onClose()
          return
        }
        setTrackTransform(0, true)
        return
      }

      // 가로 — 25% 임계치.
      if (axis === 'h') {
        const threshold = viewportWidth * THRESHOLD_RATIO
        if (dx <= -threshold && c.hasNext) {
          // next 로 스냅. 트랙을 한 슬롯 더(=-1슬롯) 왼쪽으로 슬라이드 → next 가 0 으로.
          // 트랙 transform 식: translate3d(calc(-100% + dx), 0, 0).
          // -1슬롯 위치 = translate3d(-200%, 0, 0) = dx = -viewportWidth.
          setTrackTransform(-viewportWidth, true)
          // 스냅 종료에 맞춰 router.replace. 새 페이지 RSC 가 도착하면 current.id 가
          // 바뀌고 위의 useEffect 가 트랙을 0 으로 리셋 — 시각적 점프 없음.
          c.onNext()
          return
        }
        if (dx >= threshold && c.hasPrev) {
          setTrackTransform(viewportWidth, true)
          c.onPrev()
          return
        }
        // 임계 미만 → 중앙으로 스프링 백.
        setTrackTransform(0, true)
        return
      }

      // axis === 'none' (살짝만 움직임) → 그냥 리셋.
      setTrackTransform(0, true)
    }

    // §17 #19 vaul 안에서 transform 컨테이닝 이슈는 여기 직접 영향 없음(detail
    // 페이지는 vaul 시트 안에 살지 않는다) — 단, rzpp 가 자기 노드에서 touch 이벤트
    // 에 stopPropagation 을 걸어 React 합성 핸들러가 안 불리는 케이스가 있어
    // **capture 단계 네이티브 리스너** 로 단다. 우리는 stopPropagation/preventDefault
    // 를 하지 않으므로 rzpp 의 줌/팬도 그대로 동작.
    const opts: AddEventListenerOptions = { capture: true, passive: true }
    el.addEventListener('touchstart', onStart, opts)
    el.addEventListener('touchmove', onMove, opts)
    el.addEventListener('touchend', onEnd, opts)
    el.addEventListener('touchcancel', onEnd, opts)
    return () => {
      el.removeEventListener('touchstart', onStart, opts)
      el.removeEventListener('touchmove', onMove, opts)
      el.removeEventListener('touchend', onEnd, opts)
      el.removeEventListener('touchcancel', onEnd, opts)
    }
  }, [setTrackTransform])

  // 트랙 초기 transform: -100%/3 (slot 0 = prev 가 화면 왼쪽 밖, current 가 화면 안,
  // next 가 화면 오른쪽 밖). 트랙 폭이 300% 이므로 `-100%/3` 가 정확히 한 슬롯
  // (= 1 뷰포트) 만큼 좌측 이동.
  const initialTrackStyle: CSSProperties = {
    transform: 'translate3d(calc(-100% / 3), 0, 0)',
    touchAction: 'pan-y',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    overscrollBehavior: 'contain',
  }

  return (
    <div
      ref={viewportRef}
      onClick={() => {
        if (!suppressTap.current) cfg.current.onTap?.()
      }}
      // h-screen + dynamic top/bottom padding so the photo fits BETWEEN the
      // top bar and (mobile) action bar when chrome is showing — no overlap.
      // Tap to hide chrome → padding collapses smoothly → image expands.
      // Desktop has no bottom action bar, so pb collapses there (md:pb-0).
      className={`relative h-screen w-full overflow-hidden transition-[padding] duration-200 ease-out ${
        chromeVisible
          ? 'pt-[calc(env(safe-area-inset-top)+56px)] pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-0'
          : 'pt-0 pb-0'
      }`}
    >
      {/* 카루셀 트랙 — width: 300%, 세 슬롯이 각각 33.33% (=1 viewport). */}
      <div
        ref={trackRef}
        className="flex h-full w-[300%] will-change-transform"
        style={initialTrackStyle}
      >
        <CarouselSlot slim={prev} slot="prev" />
        <CarouselSlot slim={current} slot="current" onScaleChange={onScaleChange} />
        <CarouselSlot slim={next} slot="next" />
      </div>
    </div>
  )
}

function CarouselSlot({
  slim,
  slot,
  onScaleChange,
}: {
  slim: AssetSlim | null
  slot: 'prev' | 'current' | 'next'
  onScaleChange?: (s: number) => void
}) {
  // 각 슬롯은 정확히 33.33% (= 1 viewport 너비) 차지.
  const slotClass = 'flex h-full w-1/3 shrink-0 items-center justify-center'

  if (!slim) {
    // 가장자리(없는 슬롯) — 검은 빈 영역. 러버밴드 드래그 시 살짝 보임.
    return <div className={slotClass} />
  }

  const trio = pickDisplayTrio(slim.urls)
  const fallbackUrl = pickDisplayUrl(slim.urls)
  const blurhash = pickBlurhash(slim.urls)
  const isVideo = slim.kind === 'video'

  // 영상 슬롯은 포스터만 보여줌(prev/next 위치) — 실 재생은 navigate 후 ViewerImage
  // 의 video 분기에서. slot='current' 에서 video 가 들어오는 경우는 ViewerImage 의
  // 영상 분기로 일찍 빠져서 여기 안 옴.
  if (isVideo) {
    if (!slim.posterUrl) return <div className={slotClass} />
    return (
      <div className={slotClass}>
        <img
          src={slim.posterUrl}
          alt=""
          className="max-h-full max-w-full"
          style={{ objectFit: 'contain' }}
        />
      </div>
    )
  }

  // prev / next 는 미리 깔린 placeholder + 이미지(eager). loading=eager 로 두면
  // 시트가 열리는 그 순간 픽셀이 이미 거기 있어서 swipe 가 매끄러움.
  if (slot !== 'current') {
    return (
      <div className={slotClass}>
        <PictureImage
          trio={trio}
          fallbackUrl={fallbackUrl}
          alt=""
          dominantColor={slim.urls?.dominantColor ?? null}
          blurhash={blurhash}
          aspectRatio={slim.urls?.aspectRatio ?? null}
          loading="eager"
          fetchPriority="low"
          objectFit="contain"
          className="max-h-full max-w-full"
        />
      </div>
    )
  }

  // current 슬롯 — TransformWrapper 로 줌/핀치/팬. view-transition-name 도 여기.
  return (
    <div className={slotClass}>
      <TransformWrapper
        minScale={1}
        maxScale={4}
        doubleClick={{ mode: 'zoomIn', step: 1.5 }}
        wheel={{ step: 0.2 }}
        onTransform={(_ref, state) => onScaleChange?.(state.scale)}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          // Flex-center the image inside so it stays centered when the parent
          // shrinks (chrome-visible padding) — default content alignment was
          // top-left, which made the photo left-justify as the area shrank.
          contentStyle={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PictureImage
            trio={trio}
            fallbackUrl={fallbackUrl}
            alt=""
            dominantColor={slim.urls?.dominantColor ?? null}
            blurhash={blurhash}
            aspectRatio={slim.urls?.aspectRatio ?? null}
            loading="eager"
            fetchPriority="high"
            objectFit="contain"
            className="max-h-full max-w-full"
            // per-id name → 타임라인 썸네일(같은 asset-{id})에서 풀스크린 이미지로
            // 매칭돼 자라는 iOS Photos 식 morph. 디테일↔디테일 형제 이동은 id 가
            // 다르므로 매칭 없음 → 기본 UA crossfade. (핑거 트랙 스와이프 자체는
            // CSS transform 으로 이미 매끄러우므로 view transition 없이도 OK.)
            style={{ viewTransitionName: `asset-${slim.id}` } as CSSProperties}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}

// 영상용 단순 SwipeLayer — 영상은 <video controls> 의 제스처와 핑거트랙이 충돌해
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
