'use client'
import { cn } from '@/lib/cn'
import { ImagePlus } from 'lucide-react'

type Props = {
  onUpload: () => void
  className?: string
}

/**
 * Single-purpose FAB: photo / video upload.
 * Diary-style posts now live in the timeline composer at the top of
 * /timeline, so the dual-action menu was retired in favor of a one-tap
 * upload button. Less ambiguity, less motion.
 *
 * Uses plain CSS active:scale rather than framer-motion so the lib doesn't
 * land in the always-rendered app shell bundle. framer-motion is reserved
 * for richer interactions (sheet shells, like animation).
 */
export function FAB({ onUpload, className }: Props) {
  return (
    <div className={cn('fixed bottom-20 right-4 z-30 md:bottom-8', className)}>
      <button
        type="button"
        onClick={onUpload}
        aria-label="사진 · 영상 올리기"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-point-500 text-white shadow-elevated transition-all duration-150 ease-out hover:bg-point-600 active:scale-[0.92]"
      >
        <ImagePlus className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  )
}
