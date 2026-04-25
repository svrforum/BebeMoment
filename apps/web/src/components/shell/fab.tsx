'use client'
import { cn } from '@/lib/cn'
import { motion } from 'framer-motion'
import { ImagePlus } from 'lucide-react'

type Props = {
  onUpload: () => void
  className?: string
}

/**
 * Single-purpose FAB: photo / video upload.
 * Journal-style posts now live in the timeline composer at the top of
 * /timeline, so the dual-action menu was retired in favor of a one-tap
 * upload button. Less ambiguity, less motion.
 */
export function FAB({ onUpload, className }: Props) {
  return (
    <div className={cn('fixed bottom-20 right-4 z-30 md:bottom-8', className)}>
      <motion.button
        type="button"
        onClick={onUpload}
        aria-label="사진 · 영상 올리기"
        whileTap={{ scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 480, damping: 22 }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-point-500 text-white shadow-elevated transition-colors hover:bg-point-600"
      >
        <ImagePlus className="h-6 w-6" strokeWidth={2.5} />
      </motion.button>
    </div>
  )
}
