'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickDisplayTrio, pickDisplayUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { useRouter } from 'next/navigation'
import {
  type CSSProperties,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
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
  onToggleChrome,
}: {
  current: AssetSlim
  siblings: { prevId: string | undefined; nextId: string | undefined }
  onToggleChrome?: () => void
}) {
  const router = useRouter()
  const [scale, setScale] = useState(1)

  // 스와이프 이동은 replace — push 면 이미지마다 히스토리가 쌓여 닫기(X·뒤로·Esc·
  // 드래그다운=router.back)가 이전 이미지로 가버린다. replace 면 히스토리가
  // [그리드, 현재이미지] 로 유지돼 닫기가 그리드로 정확히 나간다.
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
      <SwipeLayer enabled onNext={goNext} onPrev={goPrev} onClose={goBack} onTap={onToggleChrome}>
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
          contentStyle={{ width: '100%', height: '100%' }}
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
            className="max-h-screen max-w-full"
            style={{ viewTransitionName: `asset-${current.id}` } as CSSProperties}
          />
        </TransformComponent>
      </TransformWrapper>
    </SwipeLayer>
  )
}

// 한 손가락 제스처만 스와이프(prev/next)·드래그다운(close)로 해석한다.
// 두 손가락(핀치)은 **무시**해서 react-zoom-pan-pinch 가 줌을 가져가게 한다.
// (framer drag 로 하면 핀치의 첫 손가락을 가로 스와이프로 오인해 옆 사진으로
//  넘어가는 버그가 있었다 — 멀티터치를 명시적으로 배제하는 게 유일하게 확실하다.)
const SWIPE_X = 60
const CLOSE_Y = 110
const TAP_SLOP = 8

function SwipeLayer({
  enabled,
  onNext,
  onPrev,
  onClose,
  onTap,
  children,
}: {
  enabled: boolean
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  onTap?: (() => void) | undefined
  children: ReactNode
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const multiTouch = useRef(false)
  const moved = useRef(false)
  // 스와이프/팬 직후 브라우저가 합성 click 을 쏘므로, 그 click 의 onTap 을 가드.
  const swiped = useRef(false)

  const onTouchStart = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length > 1) {
      multiTouch.current = true
      start.current = null
      return
    }
    multiTouch.current = false
    moved.current = false
    const t = e.touches[0]
    start.current = t ? { x: t.clientX, y: t.clientY } : null
  }, [])

  const onTouchMove = useCallback((e: ReactTouchEvent) => {
    if (e.touches.length > 1) {
      multiTouch.current = true
      start.current = null
      return
    }
    const s = start.current
    const t = e.touches[0]
    if (!s || !t) return
    if (Math.abs(t.clientX - s.x) > TAP_SLOP || Math.abs(t.clientY - s.y) > TAP_SLOP) {
      moved.current = true
    }
  }, [])

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      if (multiTouch.current) {
        // 손가락이 모두 떨어지면 멀티터치 플래그 해제.
        if (e.touches.length === 0) multiTouch.current = false
        start.current = null
        return
      }
      const s = start.current
      start.current = null
      if (!s) return
      if (!moved.current) return // 탭 → 합성 click 이 onTap 처리
      swiped.current = true
      window.setTimeout(() => {
        swiped.current = false
      }, 0)
      if (!enabled) return // 줌 상태: 팬은 zoom 라이브러리가 처리
      const ch = e.changedTouches[0]
      if (!ch) return
      const dx = ch.clientX - s.x
      const dy = ch.clientY - s.y
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < -SWIPE_X) onNext()
        else if (dx > SWIPE_X) onPrev()
      } else if (dy > CLOSE_Y) {
        onClose()
      }
    },
    [enabled, onNext, onPrev, onClose],
  )

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 모바일 탭=크롬 토글 어포던스. 키보드 제어(←/→/Esc)는 ViewerImage 의 전역 keydown 으로 제공.
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={() => {
        if (!swiped.current) onTap?.()
      }}
      className="flex min-h-screen w-full items-center justify-center"
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
      className="max-h-screen max-w-full"
    >
      <track kind="captions" />
    </video>
  )
}
