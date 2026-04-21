'use client'
import { cn } from '@/lib/cn'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

type AssetSlim = {
  id: string
  kind: 'image' | 'video'
  mediaUrl: string
  posterUrl: string | undefined
}

type Props = {
  current: AssetSlim
  siblings: { prevId: string | undefined; nextId: string | undefined }
  originalFilename: string
}

export function DetailViewer({ current, siblings, originalFilename }: Props) {
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

  return (
    <div className="bg-black">
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/60 to-transparent px-4 py-3 flex items-center justify-between">
        <Link href="/timeline" aria-label="닫기" className="text-white">
          <X className="h-6 w-6" />
        </Link>
        <p className="text-white text-sm font-medium truncate max-w-[60%]">{originalFilename}</p>
        <div className="w-6" />
      </div>
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
          className="min-h-screen flex items-center justify-center"
        >
          {current.kind === 'video' ? (
            <video
              src={current.mediaUrl}
              poster={current.posterUrl}
              controls
              className="max-h-screen max-w-full"
            >
              <track kind="captions" />
            </video>
          ) : (
            <img
              src={current.mediaUrl}
              alt={originalFilename}
              className="max-h-screen max-w-full object-contain"
            />
          )}
        </motion.div>
      </AnimatePresence>
      {siblings.prevId && (
        <button
          type="button"
          onClick={goPrev}
          className={cn(
            'hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-40 h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70',
          )}
          aria-label="이전"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {siblings.nextId && (
        <button
          type="button"
          onClick={goNext}
          className="hidden md:flex fixed right-4 top-1/2 -translate-y-1/2 z-40 h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          aria-label="다음"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
