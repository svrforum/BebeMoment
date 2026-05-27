'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickBlurhash, pickDisplayTrio, pickDisplayUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from 'react'
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

// scale<=1 일 때 한 motion.div 로 가로 스와이프(prev/next) + 세로 드래그-다운(close).
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
  const [dragging, setDragging] = useState(false)

  return (
    <motion.div
      key="swipe"
      drag={enabled}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.4}
      onDragStart={() => setDragging(true)}
      onDragEnd={(_, info) => {
        // drag 종료 직후 click 이 따라오는 브라우저 대비 가드(아래 onClick).
        window.setTimeout(() => setDragging(false), 0)
        if (Math.abs(info.offset.x) > Math.abs(info.offset.y)) {
          if (info.offset.x < -80) onNext()
          else if (info.offset.x > 80) onPrev()
        } else if (info.offset.y > 120) {
          onClose()
        }
      }}
      onClick={() => {
        if (!dragging) onTap?.()
      }}
      className="flex min-h-screen w-full items-center justify-center"
    >
      {children}
    </motion.div>
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
