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

export function ViewerImage({
  current,
  siblings,
  chromeVisible,
  onToggleChrome,
}: {
  current: AssetSlim
  siblings: { prevId: string | undefined; nextId: string | undefined }
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
  // 크로스페이드(짧고 깔끔). 임의 키프레임 슬라이드는 timeline→detail 경로에서
  // 절반-갈라진 듯한 인상을 줘서 제거.
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
  const blurhash = pickBlurhash(current.urls)
  const isVideo = current.kind === 'video'
  const noMedia = isVideo ? current.videoSrc === null : trio === null && fallbackUrl === null

  const swipeEnabled = scale <= 1.01

  if (noMedia) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-sm text-base-400">
        처리 중…
      </div>
    )
  }

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
    <SwipeLayer
      enabled={swipeEnabled}
      onNext={goNext}
      onPrev={goPrev}
      onClose={goBack}
      onTap={onToggleChrome}
      chromeVisible={chromeVisible}
    >
      <TransformWrapper
        minScale={1}
        maxScale={4}
        doubleClick={{ mode: 'zoomIn', step: 1.5 }}
        wheel={{ step: 0.2 }}
        onTransform={(_ref, state) => setScale(state.scale)}
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
            dominantColor={current.urls?.dominantColor ?? null}
            blurhash={blurhash}
            aspectRatio={current.urls?.aspectRatio ?? null}
            loading="eager"
            fetchPriority="high"
            objectFit="contain"
            className="max-h-full max-w-full"
            // per-id name → 타임라인 썸네일(같은 asset-{id})에서 풀스크린 이미지로
            // 매칭돼 자라는 iOS Photos 식 morph. 디테일↔디테일 형제 이동은 id 가
            // 다르므로 매칭 없음 → 기본 UA crossfade(짧고 깔끔).
            style={{ viewTransitionName: `asset-${current.id}` } as CSSProperties}
          />
        </TransformComponent>
      </TransformWrapper>
    </SwipeLayer>
  )
}

// 한 손가락 제스처만 스와이프(prev/next)·드래그다운(close)로 해석하고, 두 손가락
// (핀치)은 무시해 react-zoom-pan-pinch 가 줌을 가져가게 한다.
//
// 핸들러는 **네이티브 capture 리스너**로 단다: rzpp 가 자기 노드에서 touch 이벤트에
// stopPropagation 을 걸어 React 합성 핸들러(버블/캡처 모두 root 에서 디스패치)가
// 아예 안 불리는 문제가 있었다(스와이프 이동 안 됨). 조상 노드의 capture 단계는
// rzpp 보다 먼저 실행되고, 우리는 stopPropagation/preventDefault 를 안 하므로 rzpp
// 의 줌/팬도 그대로 동작한다.
const SWIPE_X = 60
const CLOSE_Y = 110
const TAP_SLOP = 8

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
  // 최신 enabled/콜백을 ref 로 노출 — 리스너는 mount 때 한 번만 단다.
  const cfg = useRef({ enabled, onNext, onPrev, onClose, onTap })
  cfg.current = { enabled, onNext, onPrev, onClose, onTap }
  // 스와이프 직후 따라올 수 있는 합성 click 의 onTap(크롬 토글) 가드.
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
      if (Math.abs(t.clientX - start.x) > TAP_SLOP || Math.abs(t.clientY - start.y) > TAP_SLOP) {
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
      if (!moved) return // 탭 → 합성 click 이 onTap(크롬 토글) 처리
      suppressTap.current = true
      window.setTimeout(() => {
        suppressTap.current = false
      }, 350)
      const c = cfg.current
      if (!c.enabled) return // 줌 상태: 팬은 rzpp 가 처리
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: 데스크탑 마우스 탭=크롬 토글. 모바일 탭은 위 네이티브 touchend 가 처리. 키보드 제어(←/→/Esc)는 ViewerImage 전역 keydown.
    <div
      ref={ref}
      onClick={() => {
        if (!suppressTap.current) cfg.current.onTap?.()
      }}
      // h-screen + dynamic top/bottom padding so the photo fits BETWEEN the
      // top bar and (mobile) action bar when chrome is showing — no overlap.
      // Tap to hide chrome → padding collapses smoothly → image expands.
      // Desktop has no bottom action bar, so pb collapses there (md:pb-0).
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
