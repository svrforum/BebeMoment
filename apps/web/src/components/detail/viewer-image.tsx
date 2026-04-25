'use client'
import { PictureImage } from '@/components/ui/picture-image'
import { pickDisplayTrio, pickDisplayUrl } from '@/lib/asset-url'
import type { AssetUrls } from '@bebe/media-client'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { type CSSProperties, useCallback, useEffect, useState } from 'react'

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
  const [dir, setDir] = useState<'left' | 'right' | null>(null)

  const goNext = useCallback(() => {
    if (siblings.nextId) {
      setDir('left')
      router.push(`/detail/${siblings.nextId}`)
    }
  }, [router, siblings.nextId])

  const goPrev = useCallback(() => {
    if (siblings.prevId) {
      setDir('right')
      router.push(`/detail/${siblings.prevId}`)
    }
  }, [router, siblings.prevId])

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

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={current.id}
        initial={{
          x: dir === 'left' ? '100%' : dir === 'right' ? '-100%' : 0,
          opacity: 0,
        }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: dir === 'left' ? '-100%' : '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80) goNext()
          else if (info.offset.x > 80) goPrev()
        }}
        onClick={onToggleChrome}
        className="flex min-h-screen items-center justify-center"
      >
        {noMedia ? (
          <div className="flex h-screen w-full items-center justify-center text-sm text-base-400">
            처리 중…
          </div>
        ) : isVideo ? (
          <video
            src={current.videoSrc ?? ''}
            poster={current.posterUrl}
            controls
            className="max-h-screen max-w-full"
          >
            <track kind="captions" />
          </video>
        ) : (
          <PictureImage
            trio={trio}
            fallbackUrl={fallbackUrl}
            alt=""
            dominantColor={current.urls?.dominantColor ?? null}
            loading="eager"
            fetchPriority="high"
            className="max-h-screen max-w-full object-contain"
            style={
              {
                touchAction: 'pinch-zoom',
                viewTransitionName: `asset-${current.id}`,
              } as CSSProperties
            }
          />
        )}
      </motion.div>
    </AnimatePresence>
  )
}
